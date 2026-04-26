import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { embed, generateText } from 'ai';

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

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

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
      .from('knowledge_docs')
      .insert({ title, source_url: 'manual_upload' })
      .select('id')
      .single();

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
        user_id: userId,
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
          this.supabase.rpc('match_knowledge', {
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: 3,
          }),
        ];

        if (isAuthenticated) {
          queries.push(
            this.supabase.rpc('match_memories', {
              query_embedding: embedding,
              match_threshold: 0.6,
              match_count: 5,
              p_user_id: userId,
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
---
${facts}
---

USER HISTORY & BEHAVIOR:
---
${memories}
---

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
  }
}
