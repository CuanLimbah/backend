import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type {
  QualityAiAnalytics,
  QualityAuditEventType,
  QualityAuditLog,
  FinalAiEvaluationReport,
  QualityFeedbackTag,
  QualityGrade,
  QualityVectorProvider,
  WasteSubmission,
  WasteType,
} from '../common/models';
import { QualityAuditLogEntity } from '../database/schemas/quality-audit-log.schema';
import { QualityCaseDatasetService } from '../quality-dataset/quality-case-dataset.service';

type AnalyticsFilters = {
  startDate?: string;
  endDate?: string;
  wasteType?: WasteType;
};

const gradeRank: Record<QualityGrade, number> = {
  A: 3,
  B: 2,
  C: 1,
};

@Injectable()
export class QualityAuditLogService {
  constructor(
    @InjectModel(QualityAuditLogEntity.name)
    private readonly qualityAuditLogModel: Model<QualityAuditLogEntity>,
    @Optional()
    private readonly qualityCaseDatasetService?: QualityCaseDatasetService,
  ) {}

  async logAiQualityChecked(submission: WasteSubmission): Promise<void> {
    await this.createSnapshotLog('ai_quality_checked', submission);
  }

  async logAdminQualityDecision(input: {
    submission: WasteSubmission;
    adminId?: string;
  }): Promise<void> {
    const isOverridden = this.isSubmissionOverridden(input.submission);
    await this.createSnapshotLog(
      isOverridden ? 'admin_overridden' : 'admin_verified',
      input.submission,
      input.adminId,
    );
  }

  private async createSnapshotLog(
    eventType: QualityAuditEventType,
    submission: WasteSubmission,
    adminId?: string,
  ): Promise<void> {
    const isOverridden = this.isSubmissionOverridden(submission);
    const aiErrorPattern = this.classifyAiErrorPattern(submission, isOverridden);

    await this.qualityAuditLogModel.create({
      id: `qal-${randomUUID()}`,
      submission_id: submission.id,
      user_id: submission.user_id,
      waste_type: submission.waste_type,
      event_type: eventType,
      ai_quality_grade: submission.ai_quality_grade,
      ai_quality_confidence: submission.ai_quality_confidence,
      ai_contamination_level: submission.ai_contamination_level,
      ai_quality_reason: submission.ai_quality_reason,
      ai_quality_rag_source: submission.ai_quality_rag_source,
      ai_quality_model: submission.ai_quality_model,
      ai_quality_source: submission.ai_quality_source,
      ai_visual_source: submission.ai_visual_source,
      ai_visual_model: submission.ai_visual_model,
      ai_visual_observations: submission.ai_visual_observations,
      ai_multimodal_rag_used: submission.ai_multimodal_rag_used,
      ai_multimodal_rag_source: submission.ai_multimodal_rag_source,
      ai_multimodal_rag_provider: submission.ai_multimodal_rag_provider,
      ai_similar_case_ids: submission.ai_similar_case_ids,
      ai_similar_case_count: submission.ai_similar_case_count,
      ai_similar_case_top_score: submission.ai_similar_case_top_score,
      final_quality_grade: submission.quality_grade,
      quality_grade_source: submission.quality_grade_source,
      admin_quality_notes: submission.admin_quality_notes,
      admin_id: adminId,
      quality_feedback: submission.quality_feedback,
      override_reason_tags: submission.override_reason_tags,
      override_primary_reason: submission.override_primary_reason,
      override_feedback_severity: submission.override_feedback_severity,
      ai_error_pattern: aiErrorPattern,
      rag_improvement_suggestion: this.getRagImprovementSuggestion(submission),
      vision_improvement_suggestion:
        this.getVisionImprovementSuggestion(submission),
      is_overridden: isOverridden,
      override_from: isOverridden ? submission.ai_quality_grade : undefined,
      override_to: isOverridden ? submission.quality_grade : undefined,
      actual_weight: submission.actual_weight,
      price_snapshot_per_kg: submission.price_snapshot_per_kg,
      final_price_per_kg: submission.final_price_per_kg,
      earnings: submission.earnings,
      created_at: new Date().toISOString(),
    });
  }

  async getAnalytics(filters: AnalyticsFilters = {}): Promise<QualityAiAnalytics> {
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

    const logs = (await this.qualityAuditLogModel
      .find(query)
      .lean()
      .exec()) as QualityAuditLog[];

    const aiLogs = logs.filter((log) => log.event_type === 'ai_quality_checked');
    const adminLogs = logs.filter((log) =>
      ['admin_verified', 'admin_overridden'].includes(log.event_type),
    );
    const comparableAdminLogs = adminLogs.filter(
      (log) => log.ai_quality_grade && log.final_quality_grade,
    );
    const overriddenLogs = comparableAdminLogs.filter((log) => log.is_overridden);
    const aiAcceptedCount = comparableAdminLogs.length - overriddenLogs.length;
    const confidenceValues = aiLogs
      .map((log) => log.ai_quality_confidence)
      .filter((value): value is number => typeof value === 'number');

    return {
      totalQualityChecks: aiLogs.length,
      totalAdminDecisions: adminLogs.length,
      aiAcceptedCount,
      adminOverrideCount: overriddenLogs.length,
      overrideRate: this.safeRatio(overriddenLogs.length, comparableAdminLogs.length),
      agreementRate: this.safeRatio(aiAcceptedCount, comparableAdminLogs.length),
      averageConfidence: confidenceValues.length
        ? this.roundMetric(
            confidenceValues.reduce((sum, value) => sum + value, 0) /
              confidenceValues.length,
          )
        : null,
      lowConfidenceReviewCount: aiLogs.filter(
        (log) =>
          typeof log.ai_quality_confidence === 'number' &&
          log.ai_quality_confidence < 0.5,
      ).length,
      ragUsage: this.countBy(aiLogs, 'ai_quality_rag_source', [
        'rag',
        'fallback_sop',
        'unknown',
      ]),
      visionUsage: this.countBy(aiLogs, 'ai_visual_source', [
        'vision_llm',
        'fallback',
        'unknown',
      ]),
      gradeDistribution: {
        ai: this.countGrades(aiLogs, 'ai_quality_grade'),
        admin: this.countGrades(adminLogs, 'final_quality_grade'),
      },
      overrideMatrix: this.buildOverrideMatrix(overriddenLogs),
      feedbackTagCounts: this.countFeedbackTags(adminLogs),
      primaryOverrideReasons: this.countPrimaryOverrideReasons(overriddenLogs),
      aiErrorPatterns: this.countAiErrorPatterns(overriddenLogs),
      multimodalRag: this.buildMultimodalRagAnalytics(logs),
      byWasteType: {
        food: this.buildWasteTypeAnalytics(logs, 'food'),
        oil: this.buildWasteTypeAnalytics(logs, 'oil'),
      },
      recentOverrides: overriddenLogs
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10)
        .map((log) => ({
          submission_id: log.submission_id,
          waste_type: log.waste_type,
          ai_quality_grade: log.ai_quality_grade,
          final_quality_grade: log.final_quality_grade,
          ai_quality_confidence: log.ai_quality_confidence,
          admin_quality_notes: log.admin_quality_notes,
          created_at: log.created_at,
        })),
    };
  }

  async getFinalAiEvaluationReport(
    filters: AnalyticsFilters = {},
  ): Promise<FinalAiEvaluationReport> {
    const analytics = await this.getAnalytics(filters);
    const dataset = this.qualityCaseDatasetService
      ? await this.qualityCaseDatasetService.getReadinessAnalytics(filters)
      : null;
    const embeddingCoverageRate =
      dataset?.embeddingCoverage?.embeddingCoverageRate ?? 0;
    const supabaseVectorSyncCoverageRate =
      dataset?.supabaseVectorCoverage?.syncCoverageRate ?? 0;
    const readinessStatus = this.getFinalReportReadinessStatus({
      analytics,
      embeddingCoverageRate,
      supabaseVectorSyncCoverageRate,
    });

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        ...(filters.startDate ? { startDate: filters.startDate } : {}),
        ...(filters.endDate ? { endDate: filters.endDate } : {}),
        ...(filters.wasteType ? { wasteType: filters.wasteType } : {}),
      },
      summary: {
        totalAiQualityChecks: analytics.totalQualityChecks,
        totalAdminDecisions: analytics.totalAdminDecisions,
        agreementRate: analytics.agreementRate,
        overrideRate: analytics.overrideRate,
        averageConfidence: analytics.averageConfidence,
        readinessStatus,
      },
      vision: {
        visionLlmCount: analytics.visionUsage.vision_llm,
        fallbackCount: analytics.visionUsage.fallback,
        visionUsageRate: this.safeRatio(
          analytics.visionUsage.vision_llm,
          analytics.visionUsage.vision_llm + analytics.visionUsage.fallback,
        ),
      },
      sopRag: {
        ragCount: analytics.ragUsage.rag,
        fallbackSopCount: analytics.ragUsage.fallback_sop,
        ragUsageRate: this.safeRatio(
          analytics.ragUsage.rag,
          analytics.ragUsage.rag + analytics.ragUsage.fallback_sop,
        ),
      },
      multimodalRag: {
        usedCount: analytics.multimodalRag.usedCount,
        usageRate: analytics.multimodalRag.usageRate,
        providerUsage: {
          supabase_pgvector:
            analytics.multimodalRag.providerUsage?.supabase_pgvector ?? 0,
          application_cosine:
            analytics.multimodalRag.providerUsage?.application_cosine ?? 0,
          fallback_none:
            analytics.multimodalRag.providerUsage?.fallback_none ?? 0,
          embedding_unavailable:
            analytics.multimodalRag.providerUsage?.embedding_unavailable ?? 0,
          unknown: analytics.multimodalRag.providerUsage?.unknown ?? 0,
        },
        averageTopSimilarity:
          analytics.multimodalRag.retrievalQuality?.averageTopSimilarity ??
          analytics.multimodalRag.averageTopSimilarityScore,
        averageSimilarCaseCount:
          analytics.multimodalRag.retrievalQuality?.averageSimilarCaseCount ??
          analytics.multimodalRag.averageSimilarCaseCount,
        noResultRetrievals:
          analytics.multimodalRag.retrievalQuality?.noResultRetrievals ??
          analytics.multimodalRag.noSimilarCaseCount,
        embeddingUnavailableRetrievals:
          analytics.multimodalRag.retrievalQuality
            ?.embeddingUnavailableRetrievals ??
          analytics.multimodalRag.embeddingUnavailableCount,
      },
      dataset: {
        totalEligibleCases: dataset?.eligibleCases ?? 0,
        embeddingCoverageRate,
        supabaseVectorSyncCoverageRate,
      },
      qualityOutcomes: {
        gradeDistributionAi: analytics.gradeDistribution.ai,
        gradeDistributionAdmin: analytics.gradeDistribution.admin,
        mostCommonOverrideReasons: analytics.primaryOverrideReasons ?? {},
        mostCommonAiErrorPatterns: analytics.aiErrorPatterns ?? {},
      },
      recommendations: this.buildFinalReportRecommendations(
        analytics,
        embeddingCoverageRate,
        supabaseVectorSyncCoverageRate,
      ),
      risks: this.buildFinalReportRisks(
        analytics,
        embeddingCoverageRate,
        supabaseVectorSyncCoverageRate,
      ),
      demoReadinessChecklist: this.buildDemoReadinessChecklist(
        analytics,
        embeddingCoverageRate,
        supabaseVectorSyncCoverageRate,
      ),
    };
  }

  private isSubmissionOverridden(submission: WasteSubmission): boolean {
    return Boolean(
      submission.ai_quality_grade &&
        submission.quality_grade &&
        submission.ai_quality_grade !== submission.quality_grade,
    );
  }

  private getFinalReportReadinessStatus(input: {
    analytics: QualityAiAnalytics;
    embeddingCoverageRate: number;
    supabaseVectorSyncCoverageRate: number;
  }): FinalAiEvaluationReport['summary']['readinessStatus'] {
    const { analytics, embeddingCoverageRate, supabaseVectorSyncCoverageRate } =
      input;

    if (
      analytics.totalQualityChecks >= 10 &&
      analytics.totalAdminDecisions >= 5 &&
      analytics.agreementRate >= 0.7 &&
      analytics.overrideRate <= 0.3 &&
      analytics.multimodalRag.usageRate >= 0.5 &&
      embeddingCoverageRate >= 0.8 &&
      supabaseVectorSyncCoverageRate >= 0.8
    ) {
      return 'ready';
    }

    if (
      analytics.totalQualityChecks >= 5 &&
      analytics.totalAdminDecisions >= 3 &&
      analytics.agreementRate >= 0.5 &&
      embeddingCoverageRate >= 0.5
    ) {
      return 'partially_ready';
    }

    return 'not_ready';
  }

  private buildFinalReportRecommendations(
    analytics: QualityAiAnalytics,
    embeddingCoverageRate: number,
    supabaseVectorSyncCoverageRate: number,
  ): string[] {
    const recommendations: string[] = [];

    if (analytics.totalQualityChecks < 10) {
      recommendations.push('Tambah sampel AI Quality Check untuk evaluasi.');
    }
    if (analytics.totalAdminDecisions < 5) {
      recommendations.push('Selesaikan lebih banyak validasi admin.');
    }
    if (analytics.overrideRate > 0.3) {
      recommendations.push('Audit AI error patterns dan prompt/SOP grading.');
    }
    if (analytics.agreementRate < 0.7) {
      recommendations.push(
        'Review kriteria grading dan kualitas observasi visual.',
      );
    }
    if (analytics.multimodalRag.usageRate < 0.5) {
      recommendations.push('Jalankan embedding/vector backfill.');
    }
    if ((analytics.multimodalRag.providerUsage?.supabase_pgvector ?? 0) === 0) {
      recommendations.push('Periksa Supabase RPC dan vector sync coverage.');
    }
    if (
      (analytics.multimodalRag.retrievalQuality?.noResultRetrievals ??
        analytics.multimodalRag.noSimilarCaseCount) > 0
    ) {
      recommendations.push(
        'Pertimbangkan menurunkan threshold atau menambah eligible historical cases.',
      );
    }
    if (
      (analytics.multimodalRag.retrievalQuality
        ?.embeddingUnavailableRetrievals ??
        analytics.multimodalRag.embeddingUnavailableCount) > 0
    ) {
      recommendations.push(
        'Periksa provider embedding dan jalankan backfill embedding.',
      );
    }
    if (supabaseVectorSyncCoverageRate < 0.8) {
      recommendations.push('Jalankan Supabase vector backfill.');
    }
    if (embeddingCoverageRate < 0.8) {
      recommendations.push('Tingkatkan embedding coverage eligible cases.');
    }

    return recommendations.length
      ? recommendations
      : ['Lanjutkan monitoring berkala dan dokumentasikan hasil demo.'];
  }

  private buildFinalReportRisks(
    analytics: QualityAiAnalytics,
    embeddingCoverageRate: number,
    supabaseVectorSyncCoverageRate: number,
  ): string[] {
    const risks: string[] = [];

    if (analytics.totalQualityChecks < 10) risks.push('Ukuran dataset masih rendah.');
    if (embeddingCoverageRate < 0.8) risks.push('Embedding coverage masih rendah.');
    if (analytics.overrideRate > 0.3) risks.push('Override admin masih tinggi.');
    if (supabaseVectorSyncCoverageRate < 0.8) {
      risks.push('Supabase vector sync coverage masih rendah.');
    }
    if (analytics.ragUsage.fallback_sop > analytics.ragUsage.rag) {
      risks.push('Fallback SOP masih dominan dibanding Supabase RAG.');
    }
    if (analytics.visionUsage.fallback > analytics.visionUsage.vision_llm) {
      risks.push('Vision fallback tinggi atau kualitas foto belum stabil.');
    }

    return risks.length ? risks : ['Tidak ada risiko dominan dari data saat ini.'];
  }

  private buildDemoReadinessChecklist(
    analytics: QualityAiAnalytics,
    embeddingCoverageRate: number,
    supabaseVectorSyncCoverageRate: number,
  ): FinalAiEvaluationReport['demoReadinessChecklist'] {
    return [
      {
        label: 'AI Quality Check available',
        status: analytics.totalQualityChecks > 0 ? 'pass' : 'fail',
        detail: `${analytics.totalQualityChecks} AI Quality Check tercatat.`,
      },
      {
        label: 'Vision-based observation available',
        status: analytics.visionUsage.vision_llm > 0 ? 'pass' : 'warning',
        detail: `${analytics.visionUsage.vision_llm} Vision LLM, ${analytics.visionUsage.fallback} fallback.`,
      },
      {
        label: 'SOP RAG available',
        status: analytics.ragUsage.rag > 0 ? 'pass' : 'warning',
        detail: `${analytics.ragUsage.rag} Supabase RAG, ${analytics.ragUsage.fallback_sop} fallback SOP.`,
      },
      {
        label: 'Multimodal RAG historical cases available',
        status: analytics.multimodalRag.usedCount > 0 ? 'pass' : 'warning',
        detail: `${analytics.multimodalRag.usedCount} quality checks memakai kasus historis.`,
      },
      {
        label: 'Supabase pgvector retrieval active',
        status:
          (analytics.multimodalRag.providerUsage?.supabase_pgvector ?? 0) > 0
            ? 'pass'
            : 'warning',
        detail: `${analytics.multimodalRag.providerUsage?.supabase_pgvector ?? 0} retrieval memakai Supabase pgvector.`,
      },
      {
        label: 'Dataset embedding coverage',
        status: embeddingCoverageRate >= 0.8 ? 'pass' : 'warning',
        detail: `Embedding coverage ${Math.round(embeddingCoverageRate * 100)}%.`,
      },
      {
        label: 'Supabase vector sync coverage',
        status: supabaseVectorSyncCoverageRate >= 0.8 ? 'pass' : 'warning',
        detail: `Vector sync coverage ${Math.round(supabaseVectorSyncCoverageRate * 100)}%.`,
      },
      {
        label: 'Audit log analytics available',
        status: analytics.totalAdminDecisions > 0 ? 'pass' : 'warning',
        detail: `${analytics.totalAdminDecisions} keputusan admin tercatat.`,
      },
      {
        label: 'Admin remains final validator',
        status: 'pass',
        detail: 'AI tetap recommendation-only.',
      },
      {
        label: 'Dynamic Pricing uses final admin grade',
        status: 'pass',
        detail: 'Payout tetap mengikuti grade final admin.',
      },
    ];
  }

  private classifyAiErrorPattern(
    submission: WasteSubmission,
    isOverridden: boolean,
  ): string | undefined {
    if (!isOverridden) return undefined;

    if (submission.override_primary_reason) {
      return submission.override_primary_reason;
    }

    if (submission.ai_visual_source === 'fallback') {
      return 'vision_fallback_used';
    }

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

  private getRagImprovementSuggestion(
    submission: WasteSubmission,
  ): string | undefined {
    const tags = submission.override_reason_tags ?? [];

    if (
      submission.ai_quality_rag_source === 'fallback_sop' ||
      tags.includes('sop_mismatch') ||
      tags.includes('rag_context_insufficient')
    ) {
      return 'Periksa dokumen SOP di Supabase RAG dan kualitas retrieval.';
    }

    return undefined;
  }

  private getVisionImprovementSuggestion(
    submission: WasteSubmission,
  ): string | undefined {
    const tags = submission.override_reason_tags ?? [];
    const visualIssueTags: QualityFeedbackTag[] = [
      'photo_unclear',
      'visual_missed_sediment',
      'visual_missed_water',
      'visual_missed_food_residue',
      'visual_missed_non_organic_contamination',
      'wrong_waste_type_detected',
      'vision_fallback_used',
    ];

    if (
      submission.ai_visual_source === 'fallback' ||
      visualIssueTags.some((tag) => tags.includes(tag))
    ) {
      return 'Periksa kualitas foto, provider vision, dan prompt observasi visual.';
    }

    return undefined;
  }

  private safeRatio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : this.roundMetric(numerator / denominator);
  }

  private roundMetric(value: number): number {
    return Number(value.toFixed(4));
  }

  private average(values: number[]): number | null {
    return values.length
      ? this.roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }

  private isMultimodalRagUsed(log: QualityAuditLog): boolean {
    return (
      log.ai_multimodal_rag_used === true ||
      log.ai_multimodal_rag_source === 'similar_quality_cases'
    );
  }

  private buildMultimodalRagAnalytics(
    logs: QualityAuditLog[],
  ): QualityAiAnalytics['multimodalRag'] {
    const aiLogs = logs.filter((log) => log.event_type === 'ai_quality_checked');
    const adminLogs = logs.filter((log) =>
      ['admin_verified', 'admin_overridden'].includes(log.event_type),
    );
    const comparableAdminLogs = adminLogs.filter(
      (log) => log.ai_quality_grade && log.final_quality_grade,
    );

    const usedAiLogs = aiLogs.filter((log) => this.isMultimodalRagUsed(log));
    const notUsedAiLogs = aiLogs.filter((log) => !this.isMultimodalRagUsed(log));
    const usedAdminLogs = comparableAdminLogs.filter((log) =>
      this.isMultimodalRagUsed(log),
    );
    const notUsedAdminLogs = comparableAdminLogs.filter(
      (log) => !this.isMultimodalRagUsed(log),
    );
    const overrideCountWhenUsed = usedAdminLogs.filter(
      (log) => log.is_overridden,
    ).length;
    const overrideCountWhenNotUsed = notUsedAdminLogs.filter(
      (log) => log.is_overridden,
    ).length;

    return {
      totalAiQualityChecks: aiLogs.length,
      usedCount: usedAiLogs.length,
      notUsedCount: aiLogs.length - usedAiLogs.length,
      usageRate: this.safeRatio(usedAiLogs.length, aiLogs.length),
      embeddingUnavailableCount: aiLogs.filter(
        (log) => log.ai_multimodal_rag_source === 'embedding_unavailable',
      ).length,
      noSimilarCaseCount: aiLogs.filter(
        (log) => log.ai_multimodal_rag_source === 'none',
      ).length,
      similarCaseContextUsedCount: aiLogs.filter(
        (log) => log.ai_multimodal_rag_source === 'similar_quality_cases',
      ).length,
      averageSimilarCaseCount: this.average(
        aiLogs
          .map((log) => log.ai_similar_case_count)
          .filter((value): value is number => typeof value === 'number'),
      ),
      averageTopSimilarityScore: this.average(
        aiLogs
          .map((log) => log.ai_similar_case_top_score)
          .filter((value): value is number => typeof value === 'number'),
      ),
      averageConfidenceWhenUsed: this.average(
        usedAiLogs
          .map((log) => log.ai_quality_confidence)
          .filter((value): value is number => typeof value === 'number'),
      ),
      averageConfidenceWhenNotUsed: this.average(
        notUsedAiLogs
          .map((log) => log.ai_quality_confidence)
          .filter((value): value is number => typeof value === 'number'),
      ),
      overrideRateWhenUsed: this.safeRatio(
        overrideCountWhenUsed,
        usedAdminLogs.length,
      ),
      overrideRateWhenNotUsed: this.safeRatio(
        overrideCountWhenNotUsed,
        notUsedAdminLogs.length,
      ),
      agreementRateWhenUsed: this.safeRatio(
        usedAdminLogs.length - overrideCountWhenUsed,
        usedAdminLogs.length,
      ),
      agreementRateWhenNotUsed: this.safeRatio(
        notUsedAdminLogs.length - overrideCountWhenNotUsed,
        notUsedAdminLogs.length,
      ),
      adminDecisionCountWhenUsed: usedAdminLogs.length,
      adminDecisionCountWhenNotUsed: notUsedAdminLogs.length,
      overrideCountWhenUsed,
      overrideCountWhenNotUsed,
      sourceUsage: this.countBy(aiLogs, 'ai_multimodal_rag_source', [
        'similar_quality_cases',
        'none',
        'embedding_unavailable',
        'unknown',
      ]) as QualityAiAnalytics['multimodalRag']['sourceUsage'],
      providerUsage: this.buildMultimodalProviderUsage(aiLogs),
      retrievalQuality: this.buildRetrievalQualityAnalytics(logs),
      byWasteType: {
        food: this.buildMultimodalWasteTypeAnalytics(logs, 'food'),
        oil: this.buildMultimodalWasteTypeAnalytics(logs, 'oil'),
      },
    };
  }

  private buildMultimodalWasteTypeAnalytics(
    logs: QualityAuditLog[],
    wasteType: WasteType,
  ): QualityAiAnalytics['multimodalRag']['byWasteType'][WasteType] {
    const wasteLogs = logs.filter((log) => log.waste_type === wasteType);
    const aiLogs = wasteLogs.filter((log) => log.event_type === 'ai_quality_checked');
    const usedAiLogs = aiLogs.filter((log) => this.isMultimodalRagUsed(log));
    const comparableAdminLogs = wasteLogs.filter(
      (log) =>
        ['admin_verified', 'admin_overridden'].includes(log.event_type) &&
        log.ai_quality_grade &&
        log.final_quality_grade,
    );
    const usedAdminLogs = comparableAdminLogs.filter((log) =>
      this.isMultimodalRagUsed(log),
    );
    const notUsedAdminLogs = comparableAdminLogs.filter(
      (log) => !this.isMultimodalRagUsed(log),
    );

    return {
      totalAiQualityChecks: aiLogs.length,
      usedCount: usedAiLogs.length,
      usageRate: this.safeRatio(usedAiLogs.length, aiLogs.length),
      averageTopSimilarityScore: this.average(
        aiLogs
          .map((log) => log.ai_similar_case_top_score)
          .filter((value): value is number => typeof value === 'number'),
      ),
      overrideRateWhenUsed: this.safeRatio(
        usedAdminLogs.filter((log) => log.is_overridden).length,
        usedAdminLogs.length,
      ),
      overrideRateWhenNotUsed: this.safeRatio(
        notUsedAdminLogs.filter((log) => log.is_overridden).length,
        notUsedAdminLogs.length,
      ),
    };
  }

  private buildMultimodalProviderUsage(
    aiLogs: QualityAuditLog[],
  ): NonNullable<QualityAiAnalytics['multimodalRag']['providerUsage']> {
    return aiLogs.reduce<NonNullable<QualityAiAnalytics['multimodalRag']['providerUsage']>>(
      (counts, log) => {
        const provider = this.getMultimodalProvider(log);
        counts[provider] = (counts[provider] ?? 0) + 1;
        return counts;
      },
      {
        application_cosine: 0,
        supabase_pgvector: 0,
        fallback_none: 0,
        embedding_unavailable: 0,
        unknown: 0,
      },
    );
  }

  private getMultimodalProvider(
    log: QualityAuditLog,
  ): keyof NonNullable<QualityAiAnalytics['multimodalRag']['providerUsage']> {
    if (log.ai_multimodal_rag_provider) {
      return log.ai_multimodal_rag_provider;
    }
    if (log.ai_multimodal_rag_source === 'embedding_unavailable') {
      return 'embedding_unavailable';
    }
    if (log.ai_multimodal_rag_source === 'none') {
      return 'fallback_none';
    }
    if (log.ai_multimodal_rag_source === 'similar_quality_cases') {
      return 'application_cosine';
    }
    return 'unknown';
  }

  private buildRetrievalQualityAnalytics(
    logs: QualityAuditLog[],
  ): NonNullable<QualityAiAnalytics['multimodalRag']['retrievalQuality']> {
    const aiLogs = logs.filter((log) => log.event_type === 'ai_quality_checked');
    const retrievalLogs = aiLogs.filter(
      (log) =>
        log.ai_multimodal_rag_source ||
        log.ai_multimodal_rag_provider ||
        typeof log.ai_similar_case_count === 'number' ||
        typeof log.ai_similar_case_top_score === 'number',
    );
    const comparableAdminLogs = logs.filter(
      (log) =>
        ['admin_verified', 'admin_overridden'].includes(log.event_type) &&
        log.ai_quality_grade &&
        log.final_quality_grade,
    );
    const topScores = retrievalLogs
      .map((log) => log.ai_similar_case_top_score)
      .filter((value): value is number => typeof value === 'number');
    const similarCounts = retrievalLogs
      .map((log) => log.ai_similar_case_count)
      .filter((value): value is number => typeof value === 'number');
    const lowSimilarityCount = retrievalLogs.filter(
      (log) =>
        log.ai_multimodal_rag_source === 'similar_quality_cases' &&
        typeof log.ai_similar_case_top_score === 'number' &&
        log.ai_similar_case_top_score < 0.72,
    ).length;
    const highSimilarityCount = topScores.filter((score) => score >= 0.8).length;
    const byProvider = this.buildRetrievalQualityByProvider(
      retrievalLogs,
      comparableAdminLogs,
    );

    return {
      totalRetrievals: retrievalLogs.length,
      supabaseRetrievals: retrievalLogs.filter(
        (log) => this.getMultimodalProvider(log) === 'supabase_pgvector',
      ).length,
      applicationFallbackRetrievals: retrievalLogs.filter(
        (log) => this.getMultimodalProvider(log) === 'application_cosine',
      ).length,
      noResultRetrievals: retrievalLogs.filter(
        (log) =>
          this.getMultimodalProvider(log) === 'fallback_none' ||
          log.ai_multimodal_rag_source === 'none',
      ).length,
      embeddingUnavailableRetrievals: retrievalLogs.filter(
        (log) =>
          this.getMultimodalProvider(log) === 'embedding_unavailable' ||
          log.ai_multimodal_rag_source === 'embedding_unavailable',
      ).length,
      averageTopSimilarity: this.average(topScores),
      averageSimilarCaseCount: this.average(similarCounts),
      lowSimilarityCount,
      lowSimilarityRate: this.safeRatio(lowSimilarityCount, topScores.length),
      highSimilarityCount,
      highSimilarityRate: this.safeRatio(highSimilarityCount, topScores.length),
      byThresholdBucket: this.buildThresholdBuckets(topScores),
      byProvider,
      currentConfig: {
        provider: process.env.QUALITY_CASE_VECTOR_PROVIDER || 'supabase_pgvector',
        topK: Number(process.env.QUALITY_CASE_VECTOR_TOP_K) || 5,
        minSimilarity:
          Number(process.env.QUALITY_CASE_VECTOR_MATCH_THRESHOLD) || 0.72,
      },
      recommendation: this.buildRetrievalQualityRecommendation({
        totalRetrievals: retrievalLogs.length,
        supabaseRetrievals: retrievalLogs.filter(
          (log) => this.getMultimodalProvider(log) === 'supabase_pgvector',
        ).length,
        embeddingUnavailableRetrievals: retrievalLogs.filter(
          (log) =>
            this.getMultimodalProvider(log) === 'embedding_unavailable' ||
            log.ai_multimodal_rag_source === 'embedding_unavailable',
        ).length,
        noResultRetrievals: retrievalLogs.filter(
          (log) =>
            this.getMultimodalProvider(log) === 'fallback_none' ||
            log.ai_multimodal_rag_source === 'none',
        ).length,
        averageTopSimilarity: this.average(topScores),
        byProvider,
      }),
    };
  }

  private buildRetrievalQualityByProvider(
    retrievalLogs: QualityAuditLog[],
    comparableAdminLogs: QualityAuditLog[],
  ): NonNullable<
    QualityAiAnalytics['multimodalRag']['retrievalQuality']
  >['byProvider'] {
    const providers: Array<QualityVectorProvider | 'unknown'> = [
      'supabase_pgvector',
      'application_cosine',
      'fallback_none',
      'embedding_unavailable',
      'unknown',
    ];

    return Object.fromEntries(
      providers.map((provider) => {
        const providerRetrievalLogs = retrievalLogs.filter(
          (log) => this.getMultimodalProvider(log) === provider,
        );
        const providerAdminLogs = comparableAdminLogs.filter(
          (log) => this.getMultimodalProvider(log) === provider,
        );
        const overrideCount = providerAdminLogs.filter(
          (log) => log.is_overridden,
        ).length;
        const topScores = providerRetrievalLogs
          .map((log) => log.ai_similar_case_top_score)
          .filter((value): value is number => typeof value === 'number');
        const similarCounts = providerRetrievalLogs
          .map((log) => log.ai_similar_case_count)
          .filter((value): value is number => typeof value === 'number');

        return [
          provider,
          {
            totalRetrievals: providerRetrievalLogs.length,
            averageTopSimilarity: this.average(topScores),
            averageSimilarCaseCount: this.average(similarCounts),
            overrideRate: this.safeRatio(overrideCount, providerAdminLogs.length),
            agreementRate: this.safeRatio(
              providerAdminLogs.length - overrideCount,
              providerAdminLogs.length,
            ),
          },
        ];
      }),
    );
  }

  private buildThresholdBuckets(topScores: number[]): Record<string, number> {
    const buckets = {
      '0.00-0.59': 0,
      '0.60-0.69': 0,
      '0.70-0.79': 0,
      '0.80-0.89': 0,
      '0.90-1.00': 0,
    };

    for (const score of topScores) {
      if (score < 0.6) buckets['0.00-0.59'] += 1;
      else if (score < 0.7) buckets['0.60-0.69'] += 1;
      else if (score < 0.8) buckets['0.70-0.79'] += 1;
      else if (score < 0.9) buckets['0.80-0.89'] += 1;
      else buckets['0.90-1.00'] += 1;
    }

    return buckets;
  }

  private buildRetrievalQualityRecommendation(input: {
    totalRetrievals: number;
    supabaseRetrievals: number;
    embeddingUnavailableRetrievals: number;
    noResultRetrievals: number;
    averageTopSimilarity: number | null;
    byProvider: NonNullable<
      QualityAiAnalytics['multimodalRag']['retrievalQuality']
    >['byProvider'];
  }): string {
    if (input.totalRetrievals === 0) {
      return 'Belum ada data retrieval Multimodal RAG untuk dituning.';
    }
    if (input.supabaseRetrievals === 0) {
      return 'Supabase pgvector belum digunakan. Jalankan Supabase vector backfill dan pastikan RPC aktif.';
    }
    if (
      this.safeRatio(input.embeddingUnavailableRetrievals, input.totalRetrievals) >
      0.2
    ) {
      return 'Embedding visual-text sering tidak tersedia. Jalankan backfill embedding dan periksa provider embedding.';
    }
    if (this.safeRatio(input.noResultRetrievals, input.totalRetrievals) > 0.3) {
      return 'Banyak retrieval tidak menemukan kasus mirip. Pertimbangkan menurunkan threshold atau menambah dataset eligible.';
    }
    if (input.averageTopSimilarity != null && input.averageTopSimilarity < 0.72) {
      return 'Rata-rata similarity masih rendah. Evaluasi kualitas visual observation text dan threshold.';
    }
    if (
      input.averageTopSimilarity != null &&
      input.averageTopSimilarity >= 0.8 &&
      input.byProvider.supabase_pgvector.overrideRate <
        input.byProvider.application_cosine.overrideRate
    ) {
      return 'Konfigurasi retrieval saat ini terlihat baik untuk Supabase pgvector.';
    }
    return 'Lanjutkan monitoring dan bandingkan threshold/topK dengan data tambahan.';
  }

  private countBy<T extends QualityAuditLog>(
    logs: T[],
    key: keyof T,
    defaults: string[],
  ): Record<string, number> {
    const counts = Object.fromEntries(defaults.map((item) => [item, 0]));

    for (const log of logs) {
      const value = String(log[key] ?? 'unknown');
      counts[value] = (counts[value] ?? 0) + 1;
    }

    return counts;
  }

  private countGrades(
    logs: QualityAuditLog[],
    key: 'ai_quality_grade' | 'final_quality_grade',
  ): Record<QualityGrade, number> {
    return logs.reduce(
      (counts, log) => {
        const grade = log[key];
        if (grade) counts[grade] += 1;
        return counts;
      },
      { A: 0, B: 0, C: 0 } satisfies Record<QualityGrade, number>,
    );
  }

  private countFeedbackTags(logs: QualityAuditLog[]): Record<string, number> {
    return logs.reduce<Record<string, number>>((counts, log) => {
      for (const tag of log.override_reason_tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
      return counts;
    }, {});
  }

  private countPrimaryOverrideReasons(
    logs: QualityAuditLog[],
  ): Record<string, number> {
    return logs.reduce<Record<string, number>>((counts, log) => {
      const reason = log.override_primary_reason ?? 'unknown';
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {});
  }

  private countAiErrorPatterns(logs: QualityAuditLog[]): Record<string, number> {
    return logs.reduce<Record<string, number>>((counts, log) => {
      const pattern = log.ai_error_pattern ?? 'unknown';
      counts[pattern] = (counts[pattern] ?? 0) + 1;
      return counts;
    }, {});
  }

  private buildOverrideMatrix(logs: QualityAuditLog[]): Record<string, number> {
    return logs.reduce<Record<string, number>>((matrix, log) => {
      if (log.override_from && log.override_to) {
        const key = `${log.override_from}->${log.override_to}`;
        matrix[key] = (matrix[key] ?? 0) + 1;
      }
      return matrix;
    }, {});
  }

  private buildWasteTypeAnalytics(
    logs: QualityAuditLog[],
    wasteType: WasteType,
  ): QualityAiAnalytics['byWasteType'][WasteType] {
    const wasteLogs = logs.filter((log) => log.waste_type === wasteType);
    const aiLogs = wasteLogs.filter((log) => log.event_type === 'ai_quality_checked');
    const confidenceValues = aiLogs
      .map((log) => log.ai_quality_confidence)
      .filter((value): value is number => typeof value === 'number');

    return {
      totalQualityChecks: aiLogs.length,
      adminOverrideCount: wasteLogs.filter(
        (log) =>
          ['admin_verified', 'admin_overridden'].includes(log.event_type) &&
          log.is_overridden,
      ).length,
      averageConfidence: confidenceValues.length
        ? this.roundMetric(
            confidenceValues.reduce((sum, value) => sum + value, 0) /
              confidenceValues.length,
          )
        : null,
    };
  }
}
