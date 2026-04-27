<<<<<<< HEAD
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
=======
import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { embed, generateText } from 'ai';
import * as crypto from 'crypto';

import { WastePriceEntity } from '../database/schemas/price.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { DropPointEntity } from '../database/schemas/drop-point.schema';

import { getLlmModel, getEmbeddingModel } from './llm.factory';
import { globalToolRegistry, ToolContext } from './tools/tool.registry';
import { setWastePriceModel } from './tools/check-waste-price.tool';
import { setSubmissionModel } from './tools/get-submission-status.tool';
import { setDropPointModel } from './tools/find-drop-point.tool';

// Side-effect imports: auto-register tools
import './tools/navigate-website.tool';
import './tools/check-waste-price.tool';
import './tools/get-submission-status.tool';
import './tools/find-drop-point.tool';

function toUUID(userId: string): string {
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

@Injectable()
export class ChatService implements OnModuleInit {
  private supabase: SupabaseClient | null = null;
  private hasEmbeddingKey = false;
  private embeddingProvider: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(WastePriceEntity.name)
    private readonly wastePriceModel: Model<WastePriceEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    @InjectModel(DropPointEntity.name)
    private readonly dropPointModel: Model<DropPointEntity>,
  ) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

<<<<<<< HEAD
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
=======
    this.embeddingProvider = (this.config.get<string>('EMBEDDING_PROVIDER') || 'mistral').toLowerCase();

    if (this.embeddingProvider === 'openai') {
      this.hasEmbeddingKey = !!this.config.get<string>('OPENAI_API_KEY');
    } else if (this.embeddingProvider === 'gemini') {
      this.hasEmbeddingKey = !!this.config.get<string>('GEMINI_API_KEY');
    } else {
      this.hasEmbeddingKey = !!this.config.get<string>('MISTRAL_API_KEY');
    }
  }

  onModuleInit() {
    // Inject Mongoose models into tools
    setWastePriceModel(this.wastePriceModel);
    setSubmissionModel(this.submissionModel);
    setDropPointModel(this.dropPointModel);

    console.log('[RAG] Supabase    :', this.supabase ? 'connected' : 'NOT configured (RAG disabled)');
    console.log('[RAG] Embedding   :', this.hasEmbeddingKey ? `${this.embeddingProvider} (active)` : `${this.embeddingProvider} key MISSING (RAG disabled)`);
    console.log('[LLM] Provider    :', this.config.get('LLM_PROVIDER') || 'mistral');
  }

  getStatus() {
    const ragActive = !!this.supabase && this.hasEmbeddingKey;
    return {
      rag: {
        active: ragActive,
        supabase: !!this.supabase,
        embedding_provider: this.embeddingProvider,
        embedding_key_set: this.hasEmbeddingKey,
      },
      llm: {
        provider: this.config.get('LLM_PROVIDER') || 'mistral',
      },
    };
  }

  private chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end === text.length) break;
      start += chunkSize - overlap;
    }
    return chunks.filter((c) => c.length > 0);
  }

  async ingestKnowledge(title: string, content: string) {
    if (!this.supabase) throw new InternalServerErrorException('Supabase is not configured.');
    if (!this.hasEmbeddingKey) throw new InternalServerErrorException(`Embedding key missing for ${this.embeddingProvider}`);

    const { data: doc, error: docErr } = await this.supabase
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
      .from('knowledge_docs')
      .insert({ title, source_url: 'manual_upload' })
      .select('id')
      .single();

<<<<<<< HEAD
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
=======
    if (docErr) throw new InternalServerErrorException(docErr.message);

    const chunks = this.chunkText(content);

    const embedResults = await Promise.all(
      chunks.map((chunk) => embed({ model: getEmbeddingModel(this.config), value: chunk })),
    );

    const rows = chunks.map((chunk, i) => ({
      doc_id: doc.id,
      content: chunk,
      embedding: embedResults[i].embedding,
    }));

    const { error: chunkErr } = await this.supabase.from('knowledge_chunks').insert(rows);
    if (chunkErr) throw new InternalServerErrorException(chunkErr.message);

    return { doc_id: doc.id, chunks_created: rows.length, provider: this.embeddingProvider };
  }

  private async saveUserMemory(userId: string, content: string) {
    if (!this.supabase || !this.hasEmbeddingKey) return;

    try {
      const { embedding } = await embed({ model: getEmbeddingModel(this.config), value: content });
      await this.supabase.from('user_memories').insert({
        user_id: toUUID(userId),
        memory_type: 'chat',
        content,
        embedding,
      });
    } catch (e) {
      console.error('Failed to save user memory:', e);
    }
  }

  async handleMessage(userId: string, message: string, isAuthenticated: boolean) {
    let facts = 'No relevant facts found.';
    let memories = 'No past context found.';

    if (this.supabase && this.hasEmbeddingKey) {
      try {
        const { embedding } = await embed({ model: getEmbeddingModel(this.config), value: message });

        const queries: any[] = [
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
          this.supabase.rpc('match_knowledge', {
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: 3,
          }),
<<<<<<< HEAD
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
=======
        ];

        if (isAuthenticated) {
          queries.push(
            this.supabase.rpc('match_memories', {
              query_embedding: embedding,
              match_threshold: 0.6,
              match_count: 5,
              p_user_id: toUUID(userId),
            }),
          );
        }

        const results = await Promise.all(queries);

        const knowledgeRes = results[0];
        facts = knowledgeRes.data?.map((k: any) => k.content).join('\n') || facts;

        if (isAuthenticated && results[1]) {
          const memoryRes = results[1];
          memories = memoryRes.data?.map((m: any) => `[${m.memory_type}] ${m.content}`).join('\n') || memories;
        }
      } catch (e) {
        console.error('[RAG] Retrieval error (skipped):', e);
      }
    }

    const toolContext: ToolContext = { userId, isAuthenticated };

    const { text, toolCalls } = await generateText({
      model: getLlmModel(this.config),
      system: `You are CuanLimbah AI Assistant — a helpful assistant for a waste-to-cash platform.
You help users check waste prices, track their submissions, find drop-off points, and navigate the website.
Answer in Bahasa Indonesia unless the user writes in English.

COMPANY KNOWLEDGE:
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
---
${facts}
---

<<<<<<< HEAD
Riwayat user:
=======
USER HISTORY & BEHAVIOR:
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
---
${memories}
---

<<<<<<< HEAD
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
=======
Rules:
- If the user asks to navigate or open a page, use the 'navigate_website' tool.
- If the user asks about waste prices, use the 'check_waste_price' tool.
- If the user asks about their submission status, use the 'get_submission_status' tool.
- If the user asks about drop-off locations, use the 'find_drop_point' tool.
- Acknowledge their past history if relevant.`,
      prompt: message,
      tools: globalToolRegistry.getAllTools() as any,
    });

    let clientAction: { type: string; payload: string } | null = null;
    let finalReply = text;

    if (toolCalls?.length) {
      for (const call of toolCalls) {
        const tool = globalToolRegistry.getTool(call.toolName);
        if (!tool) continue;

        console.log(`[ToolCall] ${call.toolName}`, call);
        const args = (call as any).args || (call as any).input || {};
        const result = await tool.execute(args, toolContext);

        if (typeof result === 'string') {
          // Tool returned text — append as context for the reply
          finalReply = result;
        } else if (result?.type === 'NAVIGATE') {
          finalReply = result.reason || finalReply;
          clientAction = { type: 'NAVIGATE', payload: result.payload };
        }
      }
    }

    // Save memory (fire-and-forget, skip anonymous)
    if (isAuthenticated) {
      this.saveUserMemory(userId, `User: ${message}\nAI: ${finalReply}`).catch(console.error);
    }

    return { reply: finalReply, action: clientAction };
>>>>>>> cc69ae98d34a300ba14efc95ea8bc82cd8f12463
  }
}
