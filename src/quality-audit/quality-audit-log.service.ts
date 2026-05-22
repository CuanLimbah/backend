import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type {
  QualityAiAnalytics,
  QualityAuditEventType,
  QualityAuditLog,
  QualityFeedbackTag,
  QualityGrade,
  WasteSubmission,
  WasteType,
} from '../common/models';
import { QualityAuditLogEntity } from '../database/schemas/quality-audit-log.schema';

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
