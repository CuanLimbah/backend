import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type {
  QualityCaseDatasetRecord,
  QualityCaseEligibilityStatus,
  QualityDatasetReadinessAnalytics,
  QualityGrade,
  WasteSubmission,
  WasteType,
} from '../common/models';
import { QualityCaseDatasetEntity } from '../database/schemas/quality-case-dataset.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';

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

const gradeRank: Record<QualityGrade, number> = {
  A: 3,
  B: 2,
  C: 1,
};

@Injectable()
export class QualityCaseDatasetService {
  constructor(
    @InjectModel(QualityCaseDatasetEntity.name)
    private readonly qualityCaseDatasetModel: Model<QualityCaseDatasetEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
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

    await this.qualityCaseDatasetModel
      .findOneAndUpdate(
        { submission_id: submission.id },
        {
          $set: this.withoutUndefined(mutableRecord),
          $setOnInsert: { id: recordId },
        },
        { upsert: true, new: true },
      )
      .exec();
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
}
