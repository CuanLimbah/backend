import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Model } from 'mongoose';
import type {
  ImageEmbeddingSource,
  QualityCaseDatasetRecord,
  QualityFeedback,
  QualityFeedbackTag,
  QualityGrade,
  WasteType,
} from '../common/models';
import { QualityCaseDatasetEntity } from '../database/schemas/quality-case-dataset.schema';
import { ImageEmbeddingService } from './image-embedding.service';
import type { SimilarQualityCase } from './quality-case-dataset.service';

export const QUALITY_CASE_VECTOR_DIMENSIONS = 1024;

type VectorSyncResult = {
  submissionId: string;
  status: 'synced' | 'failed' | 'skipped';
  supabaseVectorId?: string;
  reason?: string;
};

type SupabaseQualityCaseRow = {
  id?: string;
  submission_id: string;
  waste_type: WasteType;
  image_url?: string;
  final_quality_grade?: QualityGrade;
  ai_quality_grade?: QualityGrade;
  ai_quality_confidence?: number;
  visual_observation_text?: string;
  ai_visual_source?: string;
  ai_quality_rag_source?: string;
  override_primary_reason?: QualityFeedbackTag;
  ai_error_pattern?: string;
  admin_quality_notes?: string;
  quality_feedback?: QualityFeedback;
  metadata?: Record<string, unknown>;
  similarity?: number;
  created_at?: string;
  synced_at?: string;
};

@Injectable()
export class SupabaseQualityVectorService {
  private readonly logger = new Logger(SupabaseQualityVectorService.name);
  private readonly supabase: SupabaseClient | null;
  private readonly tableName: string;
  private readonly rpcName: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(QualityCaseDatasetEntity.name)
    private readonly qualityCaseDatasetModel: Model<QualityCaseDatasetEntity>,
    private readonly imageEmbeddingService: ImageEmbeddingService,
  ) {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.tableName =
      this.config.get<string>('QUALITY_CASE_VECTOR_TABLE') ||
      'quality_case_embeddings';
    this.rpcName =
      this.config.get<string>('QUALITY_CASE_VECTOR_RPC') || 'match_quality_cases';

    this.supabase =
      supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
  }

  isEnabled(): boolean {
    const provider =
      this.config.get<string>('QUALITY_CASE_VECTOR_PROVIDER') ||
      'supabase_pgvector';

    return Boolean(
      this.supabase &&
        provider === 'supabase_pgvector' &&
        this.config.get<string>('SUPABASE_URL') &&
        this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  buildQualityVectorPayload(caseRecord: QualityCaseDatasetRecord): Record<string, unknown> {
    const visualObservationText =
      this.imageEmbeddingService.buildVisualObservationText({
        imageUrl: caseRecord.image_url,
        visualObservation: caseRecord.ai_visual_observations,
        wasteType: caseRecord.waste_type,
      }) || caseRecord.ai_visual_observations?.visualObservation;

    return this.withoutUndefined({
      submission_id: caseRecord.submission_id,
      user_id: caseRecord.user_id,
      waste_type: caseRecord.waste_type,
      image_url: caseRecord.image_url,
      visual_observation_text: visualObservationText,
      embedding: caseRecord.image_embedding,
      embedding_model: caseRecord.image_embedding_model,
      embedding_source: caseRecord.image_embedding_source ?? 'visual_text_embedding',
      final_quality_grade: caseRecord.final_quality_grade,
      ai_quality_grade: caseRecord.ai_quality_grade,
      ai_quality_confidence: caseRecord.ai_quality_confidence,
      ai_visual_source: caseRecord.ai_visual_source,
      ai_quality_rag_source: caseRecord.ai_quality_rag_source,
      override_primary_reason: caseRecord.override_primary_reason,
      ai_error_pattern: caseRecord.ai_error_pattern,
      admin_quality_notes: caseRecord.admin_quality_notes,
      quality_feedback: caseRecord.quality_feedback ?? {},
      metadata: {
        ai_similar_case_ids: caseRecord.ai_similar_case_ids,
        ai_similar_case_count: caseRecord.ai_similar_case_count,
        ai_similar_case_top_score: caseRecord.ai_similar_case_top_score,
        eligibility_status: caseRecord.eligibility_status,
        eligibility_reasons: caseRecord.eligibility_reasons,
        override_reason_tags: caseRecord.override_reason_tags,
        override_feedback_severity: caseRecord.override_feedback_severity,
        actual_weight: caseRecord.actual_weight,
        price_snapshot_per_kg: caseRecord.price_snapshot_per_kg,
        final_price_per_kg: caseRecord.final_price_per_kg,
        earnings: caseRecord.earnings,
      },
      source_created_at: caseRecord.created_at,
      source_updated_at: caseRecord.updated_at,
      synced_at: new Date().toISOString(),
    });
  }

  async upsertCaseVector(
    caseRecord: QualityCaseDatasetRecord,
  ): Promise<VectorSyncResult> {
    if (!this.isEnabled()) {
      return {
        submissionId: caseRecord.submission_id,
        status: 'skipped',
        reason: 'Supabase pgvector is not configured',
      };
    }

    if (caseRecord.eligibility_status !== 'eligible') {
      await this.updateSyncStatus(caseRecord.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'skipped',
        supabase_vector_sync_error: 'Case is not eligible for Supabase vector sync',
      });
      return {
        submissionId: caseRecord.submission_id,
        status: 'skipped',
        reason: 'Case is not eligible for Supabase vector sync',
      };
    }

    const preparedCase = await this.ensureEmbedding(caseRecord);

    if (!preparedCase.image_embedding?.length) {
      await this.updateSyncStatus(caseRecord.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error:
          'Embedding provider unavailable or insufficient data',
      });
      return {
        submissionId: caseRecord.submission_id,
        status: 'failed',
        reason: 'Embedding provider unavailable or insufficient data',
      };
    }

    const dimensionError = this.getEmbeddingDimensionError(
      preparedCase.image_embedding,
    );
    if (dimensionError) {
      await this.updateSyncStatus(caseRecord.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error: dimensionError,
      });
      return {
        submissionId: caseRecord.submission_id,
        status: 'failed',
        reason: dimensionError,
      };
    }

    try {
      const payload = this.buildQualityVectorPayload(preparedCase);
      const { data, error } = await this.supabase!
        .from(this.tableName)
        .upsert(payload, { onConflict: 'submission_id' })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      const syncedAt = new Date().toISOString();
      await this.updateSyncStatus(caseRecord.submission_id, {
        supabase_vector_synced: true,
        supabase_vector_synced_at: syncedAt,
        supabase_vector_id:
          data && typeof data === 'object' && 'id' in data
            ? String(data.id)
            : undefined,
        supabase_vector_sync_status: 'synced',
        supabase_vector_embedding_model: preparedCase.image_embedding_model,
        supabase_vector_embedding_source: preparedCase.image_embedding_source,
      });
      await this.qualityCaseDatasetModel
        .findOneAndUpdate(
          { submission_id: caseRecord.submission_id },
          { $unset: { supabase_vector_sync_error: '' } },
        )
        .exec();

      return {
        submissionId: caseRecord.submission_id,
        status: 'synced',
        supabaseVectorId:
          data && typeof data === 'object' && 'id' in data
            ? String(data.id)
            : undefined,
      };
    } catch (error) {
      const message = String(error);
      this.logger.warn(
        `Failed to sync quality case vector ${caseRecord.submission_id}: ${message}`,
      );
      await this.updateSyncStatus(caseRecord.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error: message,
      });
      return {
        submissionId: caseRecord.submission_id,
        status: 'failed',
        reason: message,
      };
    }
  }

  async syncCaseBySubmissionId(submissionId: string): Promise<VectorSyncResult> {
    const qualityCase = (await this.qualityCaseDatasetModel
      .findOne({ submission_id: submissionId })
      .lean()
      .exec()) as QualityCaseDatasetRecord | null;

    if (!qualityCase) {
      return {
        submissionId,
        status: 'failed',
        reason: `Quality dataset case for submission "${submissionId}" not found`,
      };
    }

    return this.upsertCaseVector(qualityCase);
  }

  async backfillCaseVectors(
    options: { limit?: number; force?: boolean } = {},
  ): Promise<{
    scanned: number;
    synced: number;
    skipped: number;
    failed: number;
  }> {
    const limit = Math.min(
      Math.max(
        Number(options.limit) ||
          Number(this.config.get<string>('QUALITY_CASE_VECTOR_BACKFILL_LIMIT')) ||
          50,
        1,
      ),
      500,
    );
    const query: Record<string, unknown> = { eligibility_status: 'eligible' };

    if (!options.force) {
      query.$or = [
        { supabase_vector_sync_status: { $ne: 'synced' } },
        { supabase_vector_synced: { $ne: true } },
      ];
    }

    const cases = (await this.qualityCaseDatasetModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean()
      .exec()) as QualityCaseDatasetRecord[];

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const qualityCase of cases) {
      const result = await this.upsertCaseVector(qualityCase);
      if (result.status === 'synced') synced += 1;
      if (result.status === 'skipped') skipped += 1;
      if (result.status === 'failed') failed += 1;
    }

    return { scanned: cases.length, synced, skipped, failed };
  }

  async findSimilarCases(input: {
    wasteType: WasteType;
    embedding: number[];
    excludeSubmissionId?: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<SimilarQualityCase[]> {
    if (!this.isEnabled()) return [];

    const dimensionError = this.getEmbeddingDimensionError(input.embedding);
    if (dimensionError) {
      this.logger.warn(`Supabase vector search skipped: ${dimensionError}`);
      return [];
    }

    try {
      const defaultThreshold = this.getDefaultMatchThreshold();
      const defaultTopK = this.getDefaultTopK();
      const matchThreshold = this.clampNumber(
        Number(input.minSimilarity ?? defaultThreshold),
        0,
        1,
        defaultThreshold,
      );
      const matchCount = this.clampNumber(
        Number(input.limit ?? defaultTopK),
        1,
        50,
        defaultTopK,
      );

      const { data, error } = await this.supabase!.rpc(this.rpcName, {
        query_embedding: input.embedding,
        filter_waste_type: input.wasteType,
        match_threshold: matchThreshold,
        match_count: matchCount,
        exclude_submission_id: input.excludeSubmissionId ?? null,
      });

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) return [];

      return data.map((row: SupabaseQualityCaseRow) => ({
        submission_id: row.submission_id,
        waste_type: row.waste_type,
        image_url: row.image_url,
        final_quality_grade: row.final_quality_grade,
        ai_quality_grade: row.ai_quality_grade,
        ai_quality_confidence: row.ai_quality_confidence,
        visual_observation_text: row.visual_observation_text,
        quality_feedback: row.quality_feedback,
        override_primary_reason: row.override_primary_reason,
        ai_error_pattern: row.ai_error_pattern,
        similarity: Number(row.similarity ?? 0),
        created_at: row.created_at ?? row.synced_at ?? new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.warn(`Supabase quality vector search failed: ${String(error)}`);
      return [];
    }
  }

  async getVectorSyncStatus(): Promise<{
    provider: 'supabase_pgvector';
    enabled: boolean;
    totalEligibleCases: number;
    syncedCases: number;
    unsyncedCases: number;
    failedSyncCases: number;
    syncCoverageRate: number;
  }> {
    const eligibleCases = (await this.qualityCaseDatasetModel
      .find({ eligibility_status: 'eligible' })
      .lean()
      .exec()) as QualityCaseDatasetRecord[];
    const syncedCases = eligibleCases.filter(
      (item) =>
        item.supabase_vector_synced === true &&
        item.supabase_vector_sync_status === 'synced',
    ).length;
    const failedSyncCases = eligibleCases.filter(
      (item) => item.supabase_vector_sync_status === 'failed',
    ).length;

    return {
      provider: 'supabase_pgvector',
      enabled: this.isEnabled(),
      totalEligibleCases: eligibleCases.length,
      syncedCases,
      unsyncedCases: eligibleCases.length - syncedCases,
      failedSyncCases,
      syncCoverageRate: this.safeRatio(syncedCases, eligibleCases.length),
    };
  }

  private async ensureEmbedding(
    caseRecord: QualityCaseDatasetRecord,
  ): Promise<QualityCaseDatasetRecord> {
    if (caseRecord.image_embedding?.length) {
      return caseRecord;
    }

    const result = await this.imageEmbeddingService.generateForQualityCase({
      imageUrl: caseRecord.image_url,
      visualObservation: caseRecord.ai_visual_observations,
      wasteType: caseRecord.waste_type,
    });

    if (!result) return caseRecord;

    await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: caseRecord.submission_id },
        {
          $set: {
            image_embedding: result.embedding,
            image_embedding_model: result.model,
            image_embedding_source: result.source,
            image_embedding_generated_at: new Date().toISOString(),
            image_embedding_status: 'ready',
            similarity_search_ready: true,
            updated_at: new Date().toISOString(),
          },
          $unset: { image_embedding_error: '' },
        },
      )
      .exec();

    return {
      ...caseRecord,
      image_embedding: result.embedding,
      image_embedding_model: result.model,
      image_embedding_source: result.source,
      image_embedding_status: 'ready',
      similarity_search_ready: true,
    };
  }

  private getEmbeddingDimensionError(embedding: number[]): string | null {
    const expectedDimensions =
      Number(this.config.get<string>('QUALITY_CASE_VECTOR_DIMENSIONS')) ||
      QUALITY_CASE_VECTOR_DIMENSIONS;

    return embedding.length === expectedDimensions
      ? null
      : `Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`;
  }

  private async updateSyncStatus(
    submissionId: string,
    fields: Record<string, unknown>,
  ) {
    await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: submissionId },
        { $set: this.withoutUndefined({ ...fields, updated_at: new Date().toISOString() }) },
      )
      .exec();
  }

  private safeRatio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
  }

  private getDefaultMatchThreshold(): number {
    const value = Number(
      this.config.get<string>('QUALITY_CASE_VECTOR_MATCH_THRESHOLD'),
    );
    return Number.isFinite(value) ? value : 0.72;
  }

  private getDefaultTopK(): number {
    const value = Number(this.config.get<string>('QUALITY_CASE_VECTOR_TOP_K'));
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  private clampNumber(
    value: number,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const safeValue = Number.isFinite(value) ? value : fallback;
    return Math.min(Math.max(safeValue, min), max);
  }

  private withoutUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T;
  }
}
