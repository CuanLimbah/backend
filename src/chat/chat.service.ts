import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { embed, generateText } from 'ai';
import { globalToolRegistry } from './tools.registry';
import './tools/navigate-website.tool';

type EmbeddingProvider = 'mistral' | 'openai';
type LlmProvider = 'mistral' | 'openai';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly supabase: SupabaseClient | null = null;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly hasEmbeddingKey: boolean;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL')?.trim();
    const supabaseKey = this.configService
      .get<string>('SUPABASE_SERVICE_ROLE_KEY')
      ?.trim();

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    const rawEmbeddingProvider = this.configService
      .get<string>('EMBEDDING_PROVIDER')
      ?.toLowerCase();
    this.embeddingProvider =
      rawEmbeddingProvider === 'openai' ? 'openai' : 'mistral';
    this.hasEmbeddingKey =
      this.embeddingProvider === 'openai'
        ? Boolean(this.configService.get<string>('OPENAI_API_KEY')?.trim())
        : Boolean(this.configService.get<string>('MISTRAL_API_KEY')?.trim());

    this.logger.log(
      `RAG ${this.supabase && this.hasEmbeddingKey ? 'enabled' : 'disabled'}; LLM provider ${this.getProviderName()}`,
    );
  }

  getStatus() {
    return {
      llm: {
        provider: this.getProviderName(),
        configured: this.hasLlmKey(),
      },
      rag: {
        active: Boolean(this.supabase && this.hasEmbeddingKey),
        supabase: Boolean(this.supabase),
        embedding_provider: this.embeddingProvider,
        embedding_key_set: this.hasEmbeddingKey,
      },
      tools: Object.keys(globalToolRegistry.getAllTools()),
    };
  }

  private getProviderName(): LlmProvider {
    const provider = this.configService
      .get<string>('LLM_PROVIDER')
      ?.toLowerCase()
      .trim();

    return provider === 'openai' ? 'openai' : 'mistral';
  }

  private hasLlmKey() {
    if (this.getProviderName() === 'openai') {
      return Boolean(this.configService.get<string>('OPENAI_API_KEY')?.trim());
    }

    return Boolean(this.configService.get<string>('MISTRAL_API_KEY')?.trim());
  }

  private getLlmProvider() {
    if (this.getProviderName() === 'openai') {
      const openai = createOpenAI({
        apiKey: this.configService.get<string>('OPENAI_API_KEY')?.trim(),
      });

      return openai(
        this.configService.get<string>('OPENAI_MODEL')?.trim() ||
          'gpt-4o-mini',
      );
    }

    const mistral = createMistral({
      apiKey: this.configService.get<string>('MISTRAL_API_KEY')?.trim(),
    });

    return mistral(
      this.configService.get<string>('MISTRAL_MODEL')?.trim() ||
        'mistral-small-latest',
    );
  }

  private getEmbeddingModel() {
    if (this.embeddingProvider === 'openai') {
      const openai = createOpenAI({
        apiKey: this.configService.get<string>('OPENAI_API_KEY')?.trim(),
      });

      return openai.textEmbeddingModel('text-embedding-3-small');
    }

    const mistral = createMistral({
      apiKey: this.configService.get<string>('MISTRAL_API_KEY')?.trim(),
    });

    return mistral.textEmbeddingModel('mistral-embed');
  }

  private chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end).trim());

      if (end === text.length) {
        break;
      }

      start += chunkSize - overlap;
    }

    return chunks.filter(Boolean);
  }

  private getToolInput(toolCall: unknown) {
    if (!toolCall || typeof toolCall !== 'object') {
      return undefined;
    }

    if ('args' in toolCall) {
      return toolCall.args;
    }

    if ('input' in toolCall) {
      return toolCall.input;
    }

    return undefined;
  }

  async ingestKnowledge(title: string, content: string) {
    if (!this.supabase) {
      throw new InternalServerErrorException('Supabase belum dikonfigurasi.');
    }

    if (!this.hasEmbeddingKey) {
      throw new InternalServerErrorException(
        `Embedding provider ${this.embeddingProvider} belum memiliki API key.`,
      );
    }

    const { data: doc, error: docError } = await this.supabase
      .from('knowledge_docs')
      .insert({ title, source_url: 'manual_upload' })
      .select('id')
      .single();

    if (docError) {
      throw new InternalServerErrorException(docError.message);
    }

    const chunks = this.chunkText(content);
    const embedResults = await Promise.all(
      chunks.map((chunk) => embed({ model: this.getEmbeddingModel(), value: chunk })),
    );

    const rows = chunks.map((chunk, index) => ({
      doc_id: doc.id,
      content: chunk,
      embedding: embedResults[index].embedding,
    }));

    const { error: chunkError } = await this.supabase
      .from('knowledge_chunks')
      .insert(rows);

    if (chunkError) {
      throw new InternalServerErrorException(chunkError.message);
    }

    return {
      doc_id: doc.id,
      chunks_created: rows.length,
      provider: this.embeddingProvider,
    };
  }

  private async saveUserMemory(
    userId: string,
    memoryType: 'chat' | 'behavior',
    content: string,
  ) {
    if (!this.supabase || !this.hasEmbeddingKey) {
      return;
    }

    try {
      const { embedding } = await embed({
        model: this.getEmbeddingModel(),
        value: content,
      });

      await this.supabase.from('user_memories').insert({
        user_id: userId,
        memory_type: memoryType,
        content,
        embedding,
      });
    } catch (error) {
      this.logger.warn(`Gagal menyimpan memory chat: ${String(error)}`);
    }
  }

  async handleUserMessage(userId: string, message: string) {
    if (!this.hasLlmKey()) {
      throw new InternalServerErrorException(
        'API key LLM belum dikonfigurasi di backend.',
      );
    }

    let facts = 'Belum ada pengetahuan tambahan yang relevan.';
    let memories = 'Belum ada riwayat percakapan sebelumnya.';

    if (this.supabase && this.hasEmbeddingKey) {
      try {
        const { embedding } = await embed({
          model: this.getEmbeddingModel(),
          value: message,
        });

        const [knowledgeResult, memoryResult] = await Promise.all([
          this.supabase.rpc('match_knowledge', {
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: 3,
          }),
          this.supabase.rpc('match_memories', {
            query_embedding: embedding,
            match_threshold: 0.6,
            match_count: 5,
            p_user_id: userId,
          }),
        ]);

        facts =
          knowledgeResult.data?.map((item: { content: string }) => item.content).join('\n') ||
          facts;
        memories =
          memoryResult.data
            ?.map(
              (item: { memory_type: string; content: string }) =>
                `[${item.memory_type}] ${item.content}`,
            )
            .join('\n') || memories;
      } catch (error) {
        this.logger.warn(`RAG dilewati: ${String(error)}`);
      }
    }

    const { text, toolCalls } = await generateText({
      model: this.getLlmProvider(),
      system: `Kamu adalah asisten AI untuk platform CuanLimbah.

Konteks produk:
- CuanLimbah membantu UMKM mengelola limbah minyak jelantah dan limbah makanan.
- User dapat membuat setoran limbah, melihat drop point, melacak status, dan mencairkan saldo.
- Admin dapat verifikasi setoran, mengatur harga, mengelola user, dan memproses penarikan.

Pengetahuan tambahan:
---
${facts}
---

Riwayat user:
---
${memories}
---

Aturan:
- Jawab dalam Bahasa Indonesia yang ringkas dan praktis.
- Jika user meminta buka halaman, pindah halaman, dashboard, admin, login, daftar, atau kembali ke beranda, wajib gunakan tool navigate_website.
- Jangan mengarang data saldo, status, atau transaksi spesifik jika tidak ada di konteks.`,
      prompt: message,
      tools: globalToolRegistry.getAllTools() as never,
    });

    let action: unknown = null;
    let reply = text;

    for (const call of toolCalls || []) {
      const tool = globalToolRegistry.getTool(call.toolName);

      if (!tool) {
        continue;
      }

      const result = await tool.execute(this.getToolInput(call));

      if (
        result &&
        typeof result === 'object' &&
        'type' in result &&
        result.type === 'NAVIGATE'
      ) {
        action = result;
        reply =
          'reason' in result && typeof result.reason === 'string'
            ? result.reason
            : reply;
      }
    }

    this.saveUserMemory(userId, 'chat', `User: ${message}\nAI: ${reply}`).catch(
      (error) => this.logger.warn(`Memory async error: ${String(error)}`),
    );

    return { reply, action };
  }
}
