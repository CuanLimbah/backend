import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type {
  QualityCaseDatasetRecord,
  QualityCaseEligibilityStatus,
  QualityDatasetReadinessAnalytics,
  QualityFeedback,
  QualityFeedbackTag,
  QualityGrade,
  QualityVectorProvider,
  WasteSubmission,
  WasteType,
} from '../common/models';
import { QualityCaseDatasetEntity } from '../database/schemas/quality-case-dataset.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { ImageEmbeddingService } from './image-embedding.service';
import { SupabaseQualityVectorService } from './supabase-quality-vector.service';

type ReadinessFilters = {
  wasteType?: WasteType;
  startDate?: string;
  endDate?: string;
};

type ListCaseFilters = {
  eligibilityStatus?: QualityCaseEligibilityStatus;
  wasteType?: WasteType;
  finalGrade?: QualityGrade;
  limit?: number;
};

export type SimilarQualityCase = {
  submission_id: string;
  waste_type: WasteType;
  image_url?: string;
  final_quality_grade?: QualityGrade;
  ai_quality_grade?: QualityGrade;
  ai_quality_confidence?: number;
  ai_visual_observations?: QualityCaseDatasetRecord['ai_visual_observations'];
  visual_observation_text?: string;
  quality_feedback?: QualityFeedback;
  override_primary_reason?: QualityFeedbackTag;
  ai_error_pattern?: string;
  similarity: number;
  created_at: string;
};

export type SimilarQualityCaseSearchResult = {
  cases: SimilarQualityCase[];
  provider: QualityVectorProvider;
  fallbackUsed: boolean;
};

const gradeRank: Record<QualityGrade, number> = {
  A: 3,
  B: 2,
  C: 1,
};

@Injectable()
export class QualityCaseDatasetService {
  private readonly logger = new Logger(QualityCaseDatasetService.name);

  constructor(
    @InjectModel(QualityCaseDatasetEntity.name)
    private readonly qualityCaseDatasetModel: Model<QualityCaseDatasetEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    private readonly imageEmbeddingService: ImageEmbeddingService,
    @Optional()
    private readonly supabaseQualityVectorService?: SupabaseQualityVectorService,
  ) {}

  async upsertFromSubmission(submission: WasteSubmission): Promise<void> {
    const now = new Date().toISOString();
    const eligibility = this.getEligibility(submission);
    const isOverridden = this.isSubmissionOverridden(submission);
    const record: QualityCaseDatasetRecord = {
      id: `qcd-${randomUUID()}`,
      submission_id: submission.id,
      user_id: submission.user_id,
      waste_type: submission.waste_type,
      image_url: submission.image_url,
      ai_quality_grade: submission.ai_quality_grade,
      ai_quality_confidence: submission.ai_quality_confidence,
      ai_contamination_level: submission.ai_contamination_level,
      ai_quality_reason: submission.ai_quality_reason,
      ai_quality_rag_source: submission.ai_quality_rag_source,
      ai_visual_source: submission.ai_visual_source,
      ai_visual_model: submission.ai_visual_model,
      ai_visual_observations: submission.ai_visual_observations,
      final_quality_grade: submission.quality_grade,
      quality_grade_source: submission.quality_grade_source,
      admin_quality_notes: submission.admin_quality_notes,
      quality_feedback: submission.quality_feedback,
      override_reason_tags: submission.override_reason_tags,
      override_primary_reason: submission.override_primary_reason,
      override_feedback_severity: submission.override_feedback_severity,
      ai_error_pattern: this.classifyAiErrorPattern(submission, isOverridden),
      is_overridden: isOverridden,
      ai_similar_case_ids: submission.ai_similar_case_ids,
      ai_similar_case_count: submission.ai_similar_case_count,
      ai_similar_case_top_score: submission.ai_similar_case_top_score,
      ai_multimodal_rag_used: submission.ai_multimodal_rag_used,
      ai_multimodal_rag_source: submission.ai_multimodal_rag_source,
      ai_multimodal_rag_provider: submission.ai_multimodal_rag_provider,
      ai_multimodal_rag_model: submission.ai_multimodal_rag_model,
      actual_weight: submission.actual_weight,
      price_snapshot_per_kg: submission.price_snapshot_per_kg,
      final_price_per_kg: submission.final_price_per_kg,
      earnings: submission.earnings,
      eligibility_status: eligibility.status,
      eligibility_reasons: eligibility.reasons,
      created_at: submission.created_at,
      updated_at: now,
    };

    const { id: recordId, ...mutableRecord } = record;

    const updatedCase = (await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: submission.id },
        {
          $set: this.withoutUndefined(mutableRecord),
          $setOnInsert: { id: recordId },
        },
        { upsert: true, new: true },
      )
      .exec()) as QualityCaseDatasetRecord | null;

    if (
      updatedCase?.eligibility_status === 'eligible' &&
      this.supabaseQualityVectorService
    ) {
      try {
        await this.supabaseQualityVectorService.upsertCaseVector(updatedCase);
      } catch (error) {
        this.logger.warn(
          `Failed to sync quality case vector: ${String(error)}`,
        );
      }
    }
  }

  async backfillFromCompletedSubmissions(): Promise<{
    scanned: number;
    upserted: number;
    failed: number;
  }> {
    const submissions = (await this.submissionModel
      .find({ status: { $in: ['completed', 'verified'] } })
      .lean()
      .exec()) as WasteSubmission[];

    let upserted = 0;
    let failed = 0;

    for (const submission of submissions) {
      try {
        await this.upsertFromSubmission(submission);
        upserted += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      scanned: submissions.length,
      upserted,
      failed,
    };
  }

  async generateEmbeddingForCase(submissionId: string): Promise<{
    submissionId: string;
    status: 'ready' | 'failed' | 'skipped';
    reason?: string;
  }> {
    const qualityCase = (await this.qualityCaseDatasetModel
      .findOne({ submission_id: submissionId })
      .lean()
      .exec()) as QualityCaseDatasetRecord | null;

    if (!qualityCase) {
      throw new NotFoundException(
        `Quality dataset case for submission "${submissionId}" not found`,
      );
    }

    if (qualityCase.eligibility_status !== 'eligible') {
      await this.qualityCaseDatasetModel
        .findOneAndUpdate(
          { submission_id: submissionId },
          {
            $set: {
              image_embedding_status: 'skipped',
              image_embedding_error: 'Case is not eligible for embedding',
              similarity_search_ready: false,
              updated_at: new Date().toISOString(),
            },
          },
        )
        .exec();

      return {
        submissionId,
        status: 'skipped',
        reason: 'Case is not eligible for embedding',
      };
    }

    const result = await this.imageEmbeddingService.generateForQualityCase({
      imageUrl: qualityCase.image_url,
      visualObservation: qualityCase.ai_visual_observations,
      wasteType: qualityCase.waste_type,
    });

    if (!result) {
      await this.qualityCaseDatasetModel
        .findOneAndUpdate(
          { submission_id: submissionId },
          {
            $set: {
              image_embedding_status: 'failed',
              image_embedding_error:
                'Embedding provider unavailable or insufficient data',
              similarity_search_ready: false,
              updated_at: new Date().toISOString(),
            },
          },
        )
        .exec();

      return {
        submissionId,
        status: 'failed',
        reason: 'Embedding provider unavailable or insufficient data',
      };
    }

    await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: submissionId },
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

    return { submissionId, status: 'ready' };
  }

  async backfillEmbeddingsForEligibleCases(
    options: { limit?: number; force?: boolean } = {},
  ): Promise<{
    scanned: number;
    embedded: number;
    skipped: number;
    failed: number;
  }> {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
    const query: Record<string, unknown> = {
      eligibility_status: 'eligible',
    };

    if (!options.force) {
      query.image_embedding_status = { $ne: 'ready' };
    }

    const cases = (await this.qualityCaseDatasetModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean()
      .exec()) as QualityCaseDatasetRecord[];

    let embedded = 0;
    let skipped = 0;
    let failed = 0;

    for (const qualityCase of cases) {
      try {
        const result = await this.generateEmbeddingForCase(
          qualityCase.submission_id,
        );
        if (result.status === 'ready') embedded += 1;
        if (result.status === 'skipped') skipped += 1;
        if (result.status === 'failed') failed += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      scanned: cases.length,
      embedded,
      skipped,
      failed,
    };
  }

  async findSimilarCases(input: {
    wasteType: WasteType;
    embedding: number[];
    excludeSubmissionId?: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<SimilarQualityCase[]> {
    const result = await this.findSimilarCasesWithProvider(input);
    return result.cases;
  }

  async findSimilarCasesWithProvider(input: {
    wasteType: WasteType;
    embedding: number[];
    excludeSubmissionId?: string;
    limit?: number;
    minSimilarity?: number;
    provider?: 'supabase_pgvector' | 'application_cosine' | 'auto';
  }): Promise<SimilarQualityCaseSearchResult> {
    if (!input.embedding.length) {
      return { cases: [], provider: 'embedding_unavailable', fallbackUsed: false };
    }

    if (input.provider !== 'application_cosine') {
      const supabaseCases = this.supabaseQualityVectorService
        ? await this.supabaseQualityVectorService.findSimilarCases(input)
        : [];

      if (supabaseCases.length > 0 || input.provider === 'supabase_pgvector') {
        return {
          cases: supabaseCases,
          provider: supabaseCases.length ? 'supabase_pgvector' : 'fallback_none',
          fallbackUsed: false,
        };
      }
    }

    const cases = await this.findSimilarCasesWithApplicationCosine(input);
    return {
      cases,
      provider: cases.length ? 'application_cosine' : 'fallback_none',
      fallbackUsed: input.provider !== 'application_cosine',
    };
  }

  private async findSimilarCasesWithApplicationCosine(input: {
    wasteType: WasteType;
    embedding: number[];
    excludeSubmissionId?: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<SimilarQualityCase[]> {
    const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20);
    const minSimilarity = input.minSimilarity ?? 0.7;
    const query: Record<string, unknown> = {
      eligibility_status: 'eligible',
      similarity_search_ready: true,
      image_embedding_status: 'ready',
      waste_type: input.wasteType,
    };

    if (input.excludeSubmissionId) {
      query.submission_id = { $ne: input.excludeSubmissionId };
    }

    const candidates = (await this.qualityCaseDatasetModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(500)
      .lean()
      .exec()) as QualityCaseDatasetRecord[];

    return candidates
      .map((item) => ({
        submission_id: item.submission_id,
        waste_type: item.waste_type,
        image_url: item.image_url,
        final_quality_grade: item.final_quality_grade,
        ai_quality_grade: item.ai_quality_grade,
        ai_quality_confidence: item.ai_quality_confidence,
        ai_visual_observations: item.ai_visual_observations,
        visual_observation_text: item.ai_visual_observations?.visualObservation,
        quality_feedback: item.quality_feedback,
        override_primary_reason: item.override_primary_reason,
        ai_error_pattern: item.ai_error_pattern,
        similarity: this.cosineSimilarity(input.embedding, item.image_embedding ?? []),
        created_at: item.created_at,
      }))
      .filter((item) => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  buildSimilarCasesContext(cases: SimilarQualityCase[]): string {
    if (cases.length === 0) return '';

    return [
      'KASUS HISTORIS MIRIP:',
      ...cases.slice(0, 5).map((item, index) =>
        [
          `${index + 1}. Submission ${item.submission_id}`,
          `   - Similarity: ${Math.round(item.similarity * 100)}%`,
          `   - Jenis limbah: ${item.waste_type === 'oil' ? 'minyak jelantah' : 'sisa makanan'}`,
          `   - Grade final admin: ${item.final_quality_grade ?? 'belum tersedia'}`,
          `   - Rekomendasi AI sebelumnya: ${item.ai_quality_grade ?? 'belum tersedia'}`,
          item.quality_feedback?.note
            ? `   - Catatan admin: ${item.quality_feedback.note}`
            : undefined,
          item.override_primary_reason
            ? `   - Feedback admin: ${item.override_primary_reason}`
            : undefined,
          item.ai_error_pattern
            ? `   - Pola error AI: ${item.ai_error_pattern}`
            : undefined,
          item.ai_visual_observations?.visualObservation || item.visual_observation_text
            ? `   - Observasi visual: ${item.ai_visual_observations?.visualObservation ?? item.visual_observation_text}`
            : undefined,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      'Catatan: kasus historis hanya referensi tambahan. Grade final tetap ditentukan admin.',
    ].join('\n');
  }

  async getSimilarCasesForSubmission(
    submissionId: string,
    options: { limit?: number; minSimilarity?: number } = {},
  ): Promise<SimilarQualityCase[]> {
    let qualityCase = (await this.qualityCaseDatasetModel
      .findOne({ submission_id: submissionId })
      .lean()
      .exec()) as QualityCaseDatasetRecord | null;

    if (!qualityCase) {
      throw new NotFoundException(
        `Quality dataset case for submission "${submissionId}" not found`,
      );
    }

    if (!qualityCase.image_embedding?.length) {
      const result = await this.generateEmbeddingForCase(submissionId);

      if (result.status !== 'ready') {
        throw new NotFoundException(
          result.reason ?? 'Embedding belum tersedia untuk kasus ini',
        );
      }

      qualityCase = (await this.qualityCaseDatasetModel
        .findOne({ submission_id: submissionId })
        .lean()
        .exec()) as QualityCaseDatasetRecord | null;
    }

    if (!qualityCase?.image_embedding?.length) {
      throw new NotFoundException('Embedding belum tersedia untuk kasus ini');
    }

    return this.findSimilarCases({
      wasteType: qualityCase.waste_type,
      embedding: qualityCase.image_embedding,
      excludeSubmissionId: submissionId,
      limit: options.limit,
      minSimilarity: options.minSimilarity,
    });
  }

  async getSimilarCasesForSubmissionWithProvider(
    submissionId: string,
    options: {
      limit?: number;
      minSimilarity?: number;
      provider?: 'supabase_pgvector' | 'application_cosine' | 'auto';
    } = {},
  ): Promise<SimilarQualityCaseSearchResult> {
    let qualityCase = (await this.qualityCaseDatasetModel
      .findOne({ submission_id: submissionId })
      .lean()
      .exec()) as QualityCaseDatasetRecord | null;

    if (!qualityCase) {
      throw new NotFoundException(
        `Quality dataset case for submission "${submissionId}" not found`,
      );
    }

    if (!qualityCase.image_embedding?.length) {
      const result = await this.generateEmbeddingForCase(submissionId);

      if (result.status !== 'ready') {
        throw new NotFoundException(
          result.reason ?? 'Embedding belum tersedia untuk kasus ini',
        );
      }

      qualityCase = (await this.qualityCaseDatasetModel
        .findOne({ submission_id: submissionId })
        .lean()
        .exec()) as QualityCaseDatasetRecord | null;
    }

    if (!qualityCase?.image_embedding?.length) {
      throw new NotFoundException('Embedding belum tersedia untuk kasus ini');
    }

    return this.findSimilarCasesWithProvider({
      wasteType: qualityCase.waste_type,
      embedding: qualityCase.image_embedding,
      excludeSubmissionId: submissionId,
      limit: options.limit,
      minSimilarity: options.minSimilarity,
      provider: options.provider ?? 'auto',
    });
  }

  syncCaseVectorToSupabase(submissionId: string) {
    return (
      this.supabaseQualityVectorService?.syncCaseBySubmissionId(submissionId) ?? {
        submissionId,
        status: 'skipped' as const,
        reason: 'Supabase pgvector service is not configured',
      }
    );
  }

  backfillSupabaseVectors(options: { limit?: number; force?: boolean } = {}) {
    return this.supabaseQualityVectorService?.backfillCaseVectors(options) ?? {
      scanned: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
    };
  }

  getVectorSyncStatus() {
    return (
      this.supabaseQualityVectorService?.getVectorSyncStatus() ?? {
        provider: 'supabase_pgvector' as const,
        enabled: false,
        totalEligibleCases: 0,
        syncedCases: 0,
        unsyncedCases: 0,
        failedSyncCases: 0,
        syncCoverageRate: 0,
      }
    );
  }

  async getReadinessAnalytics(
    filters: ReadinessFilters = {},
  ): Promise<QualityDatasetReadinessAnalytics> {
    const cases = await this.findCases(filters);
    const eligibleCases = cases.filter(
      (item) => item.eligibility_status === 'eligible',
    );

    return {
      totalCases: cases.length,
      eligibleCases: eligibleCases.length,
      ineligibleCases: cases.length - eligibleCases.length,
      eligibilityRate: this.safeRatio(eligibleCases.length, cases.length),
      missingImageCount: this.countMissingReason(cases, 'missing_image'),
      missingFinalGradeCount: this.countMissingReason(
        cases,
        'missing_final_grade',
      ),
      missingVisualObservationCount: this.countMissingReason(
        cases,
        'missing_visual_observation',
      ),
      missingAdminValidationCount: this.countMissingReason(
        cases,
        'missing_admin_validation',
      ),
      byWasteType: {
        food: this.buildWasteTypeReadiness(cases, 'food'),
        oil: this.buildWasteTypeReadiness(cases, 'oil'),
      },
      byFinalGrade: this.countGrades(cases),
      visionSourceUsage: this.countBy(cases, 'ai_visual_source'),
      ragSourceUsage: this.countBy(cases, 'ai_quality_rag_source'),
      feedbackTagCounts: this.countFeedbackTags(cases),
      aiErrorPatterns: this.countBy(cases, 'ai_error_pattern'),
      embeddingCoverage: this.buildEmbeddingCoverage(eligibleCases),
      supabaseVectorCoverage: this.buildSupabaseVectorCoverage(eligibleCases),
      recentEligibleCases: eligibleCases
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10)
        .map((item) => ({
          submission_id: item.submission_id,
          waste_type: item.waste_type,
          final_quality_grade: item.final_quality_grade,
          ai_quality_grade: item.ai_quality_grade,
          ai_quality_confidence: item.ai_quality_confidence,
          ai_visual_source: item.ai_visual_source,
          ai_quality_rag_source: item.ai_quality_rag_source,
          created_at: item.created_at,
        })),
    };
  }

  async listCases(
    filters: ListCaseFilters = {},
  ): Promise<QualityCaseDatasetRecord[]> {
    const query: Record<string, unknown> = {};

    if (filters.eligibilityStatus) {
      query.eligibility_status = filters.eligibilityStatus;
    }
    if (filters.wasteType) {
      query.waste_type = filters.wasteType;
    }
    if (filters.finalGrade) {
      query.final_quality_grade = filters.finalGrade;
    }

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

    return this.qualityCaseDatasetModel
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean()
      .exec() as Promise<QualityCaseDatasetRecord[]>;
  }

  private async findCases(
    filters: ReadinessFilters,
  ): Promise<QualityCaseDatasetRecord[]> {
    const query: Record<string, unknown> = {};

    if (filters.wasteType) {
      query.waste_type = filters.wasteType;
    }

    if (filters.startDate || filters.endDate) {
      query.created_at = {
        ...(filters.startDate ? { $gte: filters.startDate } : {}),
        ...(filters.endDate ? { $lte: filters.endDate } : {}),
      };
    }

    return this.qualityCaseDatasetModel
      .find(query)
      .lean()
      .exec() as Promise<QualityCaseDatasetRecord[]>;
  }

  private getEligibility(submission: WasteSubmission): {
    status: QualityCaseEligibilityStatus;
    reasons: string[];
  } {
    const reasons: string[] = [];

    if (!submission.image_url) reasons.push('missing_image');
    if (!submission.quality_grade) reasons.push('missing_final_grade');
    if (!submission.ai_visual_observations) {
      reasons.push('missing_visual_observation');
    }
    if (
      !['completed', 'verified'].includes(submission.status) ||
      (!submission.quality_grade && !submission.quality_grade_source)
    ) {
      reasons.push('missing_admin_validation');
    }

    if (reasons.length === 0) {
      return { status: 'eligible', reasons: [] };
    }

    return {
      status: reasons[0] as QualityCaseEligibilityStatus,
      reasons,
    };
  }

  private isSubmissionOverridden(submission: WasteSubmission): boolean {
    return Boolean(
      submission.ai_quality_grade &&
        submission.quality_grade &&
        submission.ai_quality_grade !== submission.quality_grade,
    );
  }

  private classifyAiErrorPattern(
    submission: WasteSubmission,
    isOverridden: boolean,
  ): string | undefined {
    if (!isOverridden) return undefined;
    if (submission.override_primary_reason) return submission.override_primary_reason;
    if (submission.ai_visual_source === 'fallback') return 'vision_fallback_used';
    if (submission.ai_quality_rag_source === 'fallback_sop') {
      return 'fallback_sop_used';
    }
    if (
      typeof submission.ai_quality_confidence === 'number' &&
      submission.ai_quality_confidence < 0.5
    ) {
      return 'low_confidence_case';
    }
    if (submission.ai_quality_grade && submission.quality_grade) {
      const aiRank = gradeRank[submission.ai_quality_grade];
      const finalRank = gradeRank[submission.quality_grade];
      if (aiRank > finalRank) return 'ai_too_optimistic';
      if (aiRank < finalRank) return 'ai_too_conservative';
    }
    return 'other';
  }

  private withoutUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T;
  }

  private safeRatio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
  }

  private countMissingReason(
    cases: QualityCaseDatasetRecord[],
    reason: string,
  ): number {
    return cases.filter((item) => item.eligibility_reasons.includes(reason))
      .length;
  }

  private buildWasteTypeReadiness(
    cases: QualityCaseDatasetRecord[],
    wasteType: WasteType,
  ): QualityDatasetReadinessAnalytics['byWasteType'][WasteType] {
    const wasteCases = cases.filter((item) => item.waste_type === wasteType);
    const eligibleCases = wasteCases.filter(
      (item) => item.eligibility_status === 'eligible',
    );

    return {
      totalCases: wasteCases.length,
      eligibleCases: eligibleCases.length,
      eligibilityRate: this.safeRatio(eligibleCases.length, wasteCases.length),
    };
  }

  private countGrades(
    cases: QualityCaseDatasetRecord[],
  ): Record<QualityGrade, number> {
    return cases.reduce(
      (counts, item) => {
        if (item.final_quality_grade) counts[item.final_quality_grade] += 1;
        return counts;
      },
      { A: 0, B: 0, C: 0 } satisfies Record<QualityGrade, number>,
    );
  }

  private countBy<T extends QualityCaseDatasetRecord>(
    cases: T[],
    key: keyof T,
  ): Record<string, number> {
    return cases.reduce<Record<string, number>>((counts, item) => {
      const value = String(item[key] ?? 'unknown');
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  }

  private countFeedbackTags(
    cases: QualityCaseDatasetRecord[],
  ): Record<string, number> {
    return cases.reduce<Record<string, number>>((counts, item) => {
      for (const tag of item.override_reason_tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
      return counts;
    }, {});
  }

  private buildEmbeddingCoverage(
    eligibleCases: QualityCaseDatasetRecord[],
  ): QualityDatasetReadinessAnalytics['embeddingCoverage'] {
    const embeddedCases = eligibleCases.filter(
      (item) =>
        item.image_embedding_status === 'ready' &&
        item.similarity_search_ready === true &&
        Array.isArray(item.image_embedding) &&
        item.image_embedding.length > 0,
    ).length;

    return {
      totalEligibleCases: eligibleCases.length,
      embeddedCases,
      missingEmbeddingCases: eligibleCases.length - embeddedCases,
      embeddingCoverageRate: this.safeRatio(embeddedCases, eligibleCases.length),
    };
  }

  private buildSupabaseVectorCoverage(
    eligibleCases: QualityCaseDatasetRecord[],
  ): QualityDatasetReadinessAnalytics['supabaseVectorCoverage'] {
    const syncedCases = eligibleCases.filter(
      (item) =>
        item.supabase_vector_synced === true &&
        item.supabase_vector_sync_status === 'synced',
    ).length;
    const failedSyncCases = eligibleCases.filter(
      (item) => item.supabase_vector_sync_status === 'failed',
    ).length;

    return {
      totalEligibleCases: eligibleCases.length,
      syncedCases,
      unsyncedCases: eligibleCases.length - syncedCases,
      failedSyncCases,
      syncCoverageRate: this.safeRatio(syncedCases, eligibleCases.length),
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
  }
}
