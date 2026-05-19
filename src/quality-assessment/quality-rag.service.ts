import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { embed } from 'ai';
import { getEmbeddingModel } from '../chat/llm.factory';
import type {
  QualityCriteriaInput,
  QualityCriteriaResult,
  RetrievedQualityChunk,
} from './types';

const FALLBACK_SOP: Record<'food' | 'oil', string[]> = {
  oil: [
    'Grade A: Relatif bersih; tidak terlihat bercampur air; endapan sangat sedikit atau tidak ada; tidak banyak sisa makanan; wadah tertutup dan aman.',
    'Grade B: Agak keruh; ada sedikit endapan; ada sedikit sisa makanan halus; tidak dominan bercampur air; masih layak diterima.',
    'Grade C: Sangat keruh; banyak endapan; terlihat bercampur air; banyak sisa makanan; kualitas rendah dan perlu review ketat.',
    'Reject criteria: kontaminasi berbahaya, wadah tidak aman, atau kondisi yang tidak dapat diproses tetap harus diputuskan admin.',
    'Tips: Saring minyak sebelum disetor, pisahkan air dan sisa makanan, gunakan wadah tertutup, dan jangan mencampur dengan cairan lain.',
  ],
  food: [
    'Grade A: Terpilah; dominan organik; tidak terlihat plastik/logam/kaca; tidak busuk ekstrem.',
    'Grade B: Ada sedikit kontaminasi ringan; masih bisa dipilah; kualitas sedang.',
    'Grade C: Banyak kontaminasi non-organik; sangat basah/busuk/tercampur; kualitas rendah dan perlu review ketat.',
    'Reject criteria: kontaminasi berbahaya, kaca/logam tajam dominan, atau kondisi yang tidak aman tetap harus diputuskan admin.',
    'Tips: Pisahkan sisa makanan dari plastik, logam, kaca, dan cairan berlebih sebelum disetor.',
  ],
};

const QUALITY_KEYWORDS = [
  'sop',
  'grade',
  'kualitas',
  'kriteria',
  'kontaminasi',
  'reject',
  'grading',
];

const QUALITY_DOCUMENT_TYPES = ['quality_sop', 'sop', 'quality'];

@Injectable()
export class QualityRagService {
  private readonly logger = new Logger(QualityRagService.name);
  private readonly supabase: SupabaseClient | null = null;
  private readonly embeddingProvider: string;

  constructor(private readonly config: ConfigService) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    this.embeddingProvider = (
      this.config.get<string>('EMBEDDING_PROVIDER') || 'mistral'
    ).toLowerCase();
  }

  async getQualityCriteria(
    input: QualityCriteriaInput,
  ): Promise<QualityCriteriaResult> {
    const fallback = this.getFallbackCriteria(input.wasteType);

    if (!this.supabase || !this.hasEmbeddingKey()) {
      return fallback;
    }

    try {
      const query = this.buildQuery(input);
      const { embedding } = await embed({
        model: getEmbeddingModel(this.config),
        value: query,
      });
      const { data, error } = await this.supabase.rpc('match_knowledge', {
        query_embedding: embedding,
        match_threshold: 0.55,
        match_count: 5,
      });

      if (error || !Array.isArray(data) || data.length === 0) {
        return fallback;
      }

      const chunks = data
        .map((row: Record<string, unknown>) => this.mapRetrievedRow(row))
        .filter((chunk) => chunk.content.trim().length > 0)
        .filter((chunk) => this.isRelevantChunk(chunk, input.wasteType));

      if (chunks.length === 0) {
        return fallback;
      }

      return {
        source: 'rag',
        retrievedChunks: chunks,
        criteria: chunks.map((chunk) => chunk.content),
        criteriaText: chunks
          .map((chunk) =>
            chunk.title ? `${chunk.title}\n${chunk.content}` : chunk.content,
          )
          .join('\n\n---\n\n'),
      };
    } catch (error) {
      this.logger.warn(`Quality RAG fallback used: ${String(error)}`);
      return fallback;
    }
  }

  private getFallbackCriteria(wasteType: 'food' | 'oil'): QualityCriteriaResult {
    const criteria = FALLBACK_SOP[wasteType];

    return {
      source: 'fallback_sop',
      criteria,
      criteriaText: criteria.join('\n'),
    };
  }

  private buildQuery(input: QualityCriteriaInput): string {
    const wasteLabel =
      input.wasteType === 'oil' ? 'minyak jelantah' : 'sisa makanan';
    const description = input.conditionDescription?.trim();

    return [
      `SOP grading ${wasteLabel}`,
      'kriteria Grade A Grade B Grade C reject criteria tips kualitas multiplier',
      description,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private hasEmbeddingKey(): boolean {
    if (this.embeddingProvider === 'openai') {
      return !!this.config.get<string>('OPENAI_API_KEY');
    }

    if (this.embeddingProvider === 'gemini') {
      return !!this.config.get<string>('GEMINI_API_KEY');
    }

    return !!this.config.get<string>('MISTRAL_API_KEY');
  }

  private mapRetrievedRow(
    row: Record<string, unknown>,
  ): RetrievedQualityChunk & { metadata?: Record<string, unknown> } {
    return {
      title: typeof row.title === 'string' ? row.title : undefined,
      content: String(row.content ?? ''),
      score:
        typeof row.similarity === 'number'
          ? row.similarity
          : typeof row.score === 'number'
            ? row.score
            : undefined,
      metadata: this.extractMetadata(row),
    };
  }

  private extractMetadata(row: Record<string, unknown>): Record<string, unknown> {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};

    return {
      ...metadata,
      wasteType: row.wasteType ?? metadata.wasteType,
      waste_type: row.waste_type ?? metadata.waste_type,
      documentType: row.documentType ?? metadata.documentType,
      document_type: row.document_type ?? metadata.document_type,
      category: row.category ?? metadata.category,
      tags: row.tags ?? metadata.tags,
    };
  }

  private isRelevantChunk(
    chunk: RetrievedQualityChunk & { metadata?: Record<string, unknown> },
    wasteType: 'food' | 'oil',
  ): boolean {
    const searchableText = this.buildSearchableText(chunk);
    const wasteMatchesByMetadata = this.matchesWasteMetadata(
      chunk.metadata,
      wasteType,
    );
    const documentTypeMatches = this.matchesDocumentMetadata(chunk.metadata);
    const hasWasteKeyword = this.getWasteKeywords(wasteType).some((keyword) =>
      searchableText.includes(keyword),
    );
    const hasQualityKeyword = QUALITY_KEYWORDS.some((keyword) =>
      searchableText.includes(keyword),
    );

    if (wasteMatchesByMetadata === false || documentTypeMatches === false) {
      return false;
    }

    if (wasteMatchesByMetadata === true) {
      return hasQualityKeyword || documentTypeMatches === true;
    }

    return hasWasteKeyword && hasQualityKeyword;
  }

  private buildSearchableText(
    chunk: RetrievedQualityChunk & { metadata?: Record<string, unknown> },
  ): string {
    const metadataText = chunk.metadata
      ? Object.values(chunk.metadata)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .filter((value) => value != null)
          .join(' ')
      : '';

    return `${chunk.title ?? ''} ${chunk.content} ${metadataText}`.toLowerCase();
  }

  private getWasteKeywords(wasteType: 'food' | 'oil'): string[] {
    return wasteType === 'oil'
      ? ['minyak', 'jelantah', 'oil']
      : ['makanan', 'sisa makanan', 'food', 'organik'];
  }

  private matchesWasteMetadata(
    metadata: Record<string, unknown> | undefined,
    wasteType: 'food' | 'oil',
  ): boolean | null {
    const value = this.stringifyMetadataValue(
      metadata?.wasteType ?? metadata?.waste_type,
    );

    if (!value) {
      return null;
    }

    if (value === wasteType) {
      return true;
    }

    return this.getWasteKeywords(wasteType).some((keyword) =>
      value.includes(keyword),
    );
  }

  private matchesDocumentMetadata(
    metadata: Record<string, unknown> | undefined,
  ): boolean | null {
    const value = this.stringifyMetadataValue(
      metadata?.documentType ?? metadata?.document_type,
    );

    if (!value) {
      return null;
    }

    return QUALITY_DOCUMENT_TYPES.some((documentType) =>
      value.includes(documentType),
    );
  }

  private stringifyMetadataValue(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).toLowerCase()).join(' ');
    }

    return value == null ? '' : String(value).toLowerCase();
  }
}
