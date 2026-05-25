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
    const normalizedCaseRecord = this.toPlainCaseRecord(caseRecord);
    const visualObservationText = this.getVisualObservationText(caseRecord);

    return this.withoutUndefined({
      submission_id: normalizedCaseRecord.submission_id,
      user_id: normalizedCaseRecord.user_id,
      waste_type: normalizedCaseRecord.waste_type,
      image_url: normalizedCaseRecord.image_url,
      visual_observation_text: visualObservationText,
      embedding: normalizedCaseRecord.image_embedding,
      embedding_model: normalizedCaseRecord.image_embedding_model,
      embedding_source:
        normalizedCaseRecord.image_embedding_source ?? 'visual_text_embedding',
      final_quality_grade: normalizedCaseRecord.final_quality_grade,
      ai_quality_grade: normalizedCaseRecord.ai_quality_grade,
      ai_quality_confidence: normalizedCaseRecord.ai_quality_confidence,
      ai_visual_source: normalizedCaseRecord.ai_visual_source,
      ai_quality_rag_source: normalizedCaseRecord.ai_quality_rag_source,
      override_primary_reason: normalizedCaseRecord.override_primary_reason,
      ai_error_pattern: normalizedCaseRecord.ai_error_pattern,
      admin_quality_notes: normalizedCaseRecord.admin_quality_notes,
      quality_feedback: normalizedCaseRecord.quality_feedback ?? {},
      metadata: {
        ai_similar_case_ids: normalizedCaseRecord.ai_similar_case_ids,
        ai_similar_case_count: normalizedCaseRecord.ai_similar_case_count,
        ai_similar_case_top_score: normalizedCaseRecord.ai_similar_case_top_score,
        eligibility_status: normalizedCaseRecord.eligibility_status,
        eligibility_reasons: normalizedCaseRecord.eligibility_reasons,
        override_reason_tags: normalizedCaseRecord.override_reason_tags,
        override_feedback_severity: normalizedCaseRecord.override_feedback_severity,
        actual_weight: normalizedCaseRecord.actual_weight,
        price_snapshot_per_kg: normalizedCaseRecord.price_snapshot_per_kg,
        final_price_per_kg: normalizedCaseRecord.final_price_per_kg,
        earnings: normalizedCaseRecord.earnings,
      },
      source_created_at: normalizedCaseRecord.created_at,
      source_updated_at: normalizedCaseRecord.updated_at,
      synced_at: new Date().toISOString(),
    });
  }

  async upsertCaseVector(
    caseRecord: QualityCaseDatasetRecord,
  ): Promise<VectorSyncResult> {
    const qualityCase = this.toPlainCaseRecord(caseRecord);

    if (!this.isEnabled()) {
      return {
        submissionId: qualityCase.submission_id,
        status: 'skipped',
        reason: 'Supabase pgvector is not configured',
      };
    }

    if (qualityCase.eligibility_status !== 'eligible') {
      await this.updateSyncStatus(qualityCase.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'skipped',
        supabase_vector_sync_error: 'Case is not eligible for Supabase vector sync',
      });
      return {
        submissionId: qualityCase.submission_id,
        status: 'skipped',
        reason: 'Case is not eligible for Supabase vector sync',
      };
    }

    const requiredFieldError = this.getRequiredPayloadFieldError(qualityCase);
    if (requiredFieldError) {
      await this.updateSyncStatus(qualityCase.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error: requiredFieldError,
      });
      return {
        submissionId: qualityCase.submission_id ?? 'unknown',
        status: 'failed',
        reason: requiredFieldError,
      };
    }

    const preparedCase = await this.ensureEmbedding(qualityCase);

    if (!preparedCase.image_embedding?.length) {
      await this.updateSyncStatus(qualityCase.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error:
          'Embedding provider unavailable or insufficient data',
      });
      return {
        submissionId: qualityCase.submission_id,
        status: 'failed',
        reason: 'Embedding provider unavailable or insufficient data',
      };
    }

    const dimensionError = this.getEmbeddingDimensionError(
      preparedCase.image_embedding,
    );
    if (dimensionError) {
      await this.updateSyncStatus(qualityCase.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error: dimensionError,
      });
      return {
        submissionId: qualityCase.submission_id,
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
      await this.updateSyncStatus(qualityCase.submission_id, {
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
          { submission_id: qualityCase.submission_id },
          { $unset: { supabase_vector_sync_error: '' } },
        )
        .exec();

      return {
        submissionId: qualityCase.submission_id,
        status: 'synced',
        supabaseVectorId:
          data && typeof data === 'object' && 'id' in data
            ? String(data.id)
            : undefined,
      };
    } catch (error) {
      const message = this.formatError(error);
      this.logger.warn(
        `Failed to sync quality case vector ${qualityCase.submission_id}: ${message}`,
      );
      await this.updateSyncStatus(qualityCase.submission_id, {
        supabase_vector_synced: false,
        supabase_vector_sync_status: 'failed',
        supabase_vector_sync_error: message,
      });
      return {
        submissionId: qualityCase.submission_id,
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
      this.logger.warn(
        `Supabase quality vector search failed: ${this.formatError(error)}`,
      );
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
    const normalizedCaseRecord = this.toPlainCaseRecord(caseRecord);

    if (normalizedCaseRecord.image_embedding?.length) {
      return normalizedCaseRecord;
    }

    const result = await this.imageEmbeddingService.generateForQualityCase({
      imageUrl: normalizedCaseRecord.image_url,
      visualObservation: normalizedCaseRecord.ai_visual_observations,
      wasteType: normalizedCaseRecord.waste_type,
    });

    if (!result) return normalizedCaseRecord;

    await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: normalizedCaseRecord.submission_id },
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
      ...normalizedCaseRecord,
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

  private getRequiredPayloadFieldError(
    caseRecord: QualityCaseDatasetRecord,
  ): string | null {
    const missingFields = [
      caseRecord.submission_id?.trim() ? undefined : 'submission_id',
      caseRecord.waste_type ? undefined : 'waste_type',
      this.getVisualObservationText(caseRecord) ? undefined : 'visual_observation_text',
    ].filter(Boolean);

    return missingFields.length
      ? `Missing required Supabase vector payload fields: ${missingFields.join(', ')}`
      : null;
  }

  private getVisualObservationText(caseRecord: QualityCaseDatasetRecord): string {
    const normalizedCaseRecord = this.toPlainCaseRecord(caseRecord);

    return (
      this.imageEmbeddingService.buildVisualObservationText({
        imageUrl: normalizedCaseRecord.image_url,
        visualObservation: normalizedCaseRecord.ai_visual_observations,
        wasteType: normalizedCaseRecord.waste_type,
      }) ||
      normalizedCaseRecord.ai_visual_observations?.visualObservation ||
      ''
    );
  }

  private toPlainCaseRecord(
    caseRecord: QualityCaseDatasetRecord,
  ): QualityCaseDatasetRecord {
    const maybeDocument = caseRecord as QualityCaseDatasetRecord & {
      toObject?: () => QualityCaseDatasetRecord;
    };

    return typeof maybeDocument.toObject === 'function'
      ? maybeDocument.toObject()
      : caseRecord;
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

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      const payload = error as Record<string, unknown>;
      const summary = [
        payload.code ? `code=${String(payload.code)}` : undefined,
        payload.message ? `message=${String(payload.message)}` : undefined,
        payload.details ? `details=${String(payload.details)}` : undefined,
        payload.hint ? `hint=${String(payload.hint)}` : undefined,
      ]
        .filter(Boolean)
        .join('; ');

      if (summary) {
        return summary;
      }

      try {
        return JSON.stringify(payload);
      } catch {
        return Object.prototype.toString.call(error);
      }
    }

    return String(error);
  }
}
