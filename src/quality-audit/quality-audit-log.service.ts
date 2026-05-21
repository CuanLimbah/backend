import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type {
  QualityAiAnalytics,
  QualityAuditEventType,
  QualityAuditLog,
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
      final_quality_grade: submission.quality_grade,
      quality_grade_source: submission.quality_grade_source,
      admin_quality_notes: submission.admin_quality_notes,
      admin_id: adminId,
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
    const overriddenLogs = adminLogs.filter((log) => log.is_overridden);
    const aiAcceptedCount = adminLogs.length - overriddenLogs.length;
    const confidenceValues = aiLogs
      .map((log) => log.ai_quality_confidence)
      .filter((value): value is number => typeof value === 'number');

    return {
      totalQualityChecks: aiLogs.length,
      totalAdminDecisions: adminLogs.length,
      aiAcceptedCount,
      adminOverrideCount: overriddenLogs.length,
      overrideRate: this.safeRatio(overriddenLogs.length, adminLogs.length),
      agreementRate: this.safeRatio(aiAcceptedCount, adminLogs.length),
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

  private safeRatio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : this.roundMetric(numerator / denominator);
  }

  private roundMetric(value: number): number {
    return Number(value.toFixed(4));
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
