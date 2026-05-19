import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { generateText } from 'ai';
import { Model } from 'mongoose';
import { z } from 'zod';
import type { ContaminationLevel, QualityGrade } from '../common/models';
import { getLlmModel } from '../chat/llm.factory';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { QualityRagService } from './quality-rag.service';
import type {
  InternalQualityAssessmentResult,
  QualityAssessmentInput,
  QualityAssessmentResult,
} from './types';

const LlmAssessmentSchema = z.object({
  recommendedGrade: z.enum(['A', 'B', 'C']),
  confidence: z.number().min(0).max(1),
  contaminationLevel: z.enum(['none', 'low', 'medium', 'high']),
  reason: z.string().min(1),
  matchedCriteria: z.array(z.string()).default([]),
  tips: z.string().min(1),
  requiresAdminReview: z.literal(true),
});

@Injectable()
export class QualityAssessmentService {
  constructor(
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    private readonly qualityRagService: QualityRagService,
    private readonly config: ConfigService,
  ) {}

  async analyzeSubmissionQuality(
    input: QualityAssessmentInput,
  ): Promise<QualityAssessmentResult> {
    const submission = await this.submissionModel
      .findOne({ id: input.submissionId })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!submission) {
      throw new NotFoundException(
        `Setoran dengan id "${input.submissionId}" tidak ditemukan`,
      );
    }

    const conditionDescription = input.conditionDescription?.trim();

    if (!conditionDescription && !submission.image_url) {
      throw new BadRequestException(
        'Deskripsi kondisi atau foto limbah diperlukan untuk AI Quality Check.',
      );
    }

    const criteria = await this.qualityRagService.getQualityCriteria({
      wasteType: submission.waste_type,
      conditionDescription,
    });

    const assessment =
      (await this.tryAssessWithLlm({
        submission,
        conditionDescription,
        criteriaText: criteria.criteriaText,
        criteria: criteria.criteria,
        ragSource: criteria.source,
      })) ??
      this.assessDeterministically({
        submissionId: submission.id,
        wasteType: submission.waste_type,
        conditionDescription,
        criteria: criteria.criteria,
        ragSource: criteria.source,
      });

    const checkedAt = new Date().toISOString();

    await this.submissionModel
      .findOneAndUpdate(
        { id: submission.id },
        {
          ai_quality_grade: assessment.recommendedGrade,
          ai_quality_confidence: assessment.confidence,
          ai_contamination_level: assessment.contaminationLevel,
          ai_quality_reason: assessment.reason,
          ai_quality_tips: assessment.tips,
          ai_quality_matched_criteria: assessment.matchedCriteria,
          ai_quality_checked_at: checkedAt,
          ai_quality_model: assessment.modelVersion,
          ai_quality_source: assessment.qualitySource,
          ai_quality_rag_source: assessment.ragSource,
        },
        { new: true },
      )
      .exec();

    const { qualitySource: _qualitySource, ...publicResult } = assessment;
    return publicResult;
  }

  private async tryAssessWithLlm(input: {
    submission: WasteSubmissionEntity;
    conditionDescription?: string;
    criteriaText: string;
    criteria: string[];
    ragSource: 'rag' | 'fallback_sop';
  }): Promise<InternalQualityAssessmentResult | null> {
    if (!this.hasLlmKey()) {
      return null;
    }

    try {
      const provider = this.getLlmProvider();
      const { text } = await generateText({
        model: getLlmModel(this.config),
        system: `You are AI Quality Control for CuanLimbah.

Assess waste quality using:
1. Waste type
2. Admin condition description
3. SOP grading criteria retrieved from Supabase RAG or fallback SOP
4. Existing image_url only as metadata reference, not as visual proof because vision model is not implemented yet

Return valid JSON only:
{
  "recommendedGrade": "A" | "B" | "C",
  "confidence": number,
  "contaminationLevel": "none" | "low" | "medium" | "high",
  "reason": "short reason in Indonesian",
  "matchedCriteria": ["..."],
  "tips": "practical improvement tips",
  "requiresAdminReview": true
}

Guardrails:
- If conditionDescription is vague, use confidence <= 0.55.
- If conditionDescription mentions mixed water, many sediments, plastic, metal, glass, dangerous contamination, or severe rotting, recommend C.
- If conditionDescription indicates clean, separated, closed container, no water, and very little sediment, recommend A or B depending on detail.
- Never claim exact lab results.
- Never decide final payout.`,
        prompt: JSON.stringify({
          wasteType: input.submission.waste_type,
          conditionDescription:
            input.conditionDescription || '(tidak ada deskripsi kondisi)',
          imageUrlAvailable: Boolean(input.submission.image_url),
          sopCriteria: input.criteriaText,
        }),
      });

      const parsed = LlmAssessmentSchema.parse(
        JSON.parse(this.extractJsonObject(text)),
      );

      return {
        submissionId: input.submission.id,
        wasteType: input.submission.waste_type,
        recommendedGrade: parsed.recommendedGrade,
        confidence: this.clampConfidence(parsed.confidence),
        contaminationLevel: parsed.contaminationLevel,
        reason: parsed.reason,
        matchedCriteria: parsed.matchedCriteria,
        tips: parsed.tips,
        requiresAdminReview: true,
        modelProvider: provider,
        modelVersion: `${provider}:quality-assessment-mvp-v1`,
        ragSource: input.ragSource,
        qualitySource: 'llm',
      };
    } catch {
      return null;
    }
  }

  private assessDeterministically(input: {
    submissionId: string;
    wasteType: 'food' | 'oil';
    conditionDescription?: string;
    criteria: string[];
    ragSource: 'rag' | 'fallback_sop';
  }): InternalQualityAssessmentResult {
    const description = (input.conditionDescription || '').toLowerCase();
    const isVague = description.trim().length < 12;
    const cKeywords = [
      'banyak endapan',
      'plastik',
      'logam',
      'kaca',
      'berbahaya',
      'busuk',
      'sangat keruh',
      'sangat basah',
      'tercampur',
    ];
    const aKeywords = [
      'bersih',
      'terpilah',
      'wadah tertutup',
      'tidak bercampur air',
      'tanpa air',
      'endapan sangat sedikit',
      'tidak ada endapan',
      'dominan organik',
    ];
    const bKeywords = ['agak keruh', 'sedikit endapan', 'sedikit kontaminasi'];

    let recommendedGrade: QualityGrade = 'B';
    let contaminationLevel: ContaminationLevel = 'low';
    let confidence = isVague ? 0.45 : 0.68;

    const mentionsMixedWater =
      (description.includes('bercampur air') ||
        description.includes('campur air') ||
        description.includes('terlihat air')) &&
      !description.includes('tidak terlihat bercampur air') &&
      !description.includes('tidak bercampur air') &&
      !description.includes('tanpa air');

    if (
      mentionsMixedWater ||
      cKeywords.some((keyword) => description.includes(keyword))
    ) {
      recommendedGrade = 'C';
      contaminationLevel = 'high';
      confidence = isVague ? 0.5 : 0.78;
    } else if (
      aKeywords.some((keyword) => description.includes(keyword)) &&
      !bKeywords.some((keyword) => description.includes(keyword))
    ) {
      recommendedGrade = 'A';
      contaminationLevel = 'none';
      confidence = isVague ? 0.5 : 0.72;
    } else if (bKeywords.some((keyword) => description.includes(keyword))) {
      recommendedGrade = 'B';
      contaminationLevel = 'low';
      confidence = isVague ? 0.5 : 0.74;
    } else if (isVague) {
      contaminationLevel = 'medium';
    }

    const reason = isVague
      ? 'Deskripsi kondisi masih terbatas, sehingga admin perlu inspeksi manual sebelum menentukan grade final.'
      : `Rekomendasi grade ${recommendedGrade} dibuat berdasarkan kecocokan deskripsi kondisi dengan SOP kualitas.`;

    return {
      submissionId: input.submissionId,
      wasteType: input.wasteType,
      recommendedGrade,
      confidence,
      contaminationLevel,
      reason,
      matchedCriteria: input.criteria.slice(0, 3),
      tips:
        input.wasteType === 'oil'
          ? 'Saring minyak, pisahkan air dan endapan, lalu gunakan wadah tertutup sebelum menyetor.'
          : 'Pisahkan sisa makanan dari plastik, logam, kaca, dan cairan berlebih sebelum menyetor.',
      requiresAdminReview: true,
      modelProvider: 'deterministic',
      modelVersion: 'deterministic:quality-assessment-mvp-v1',
      ragSource: input.ragSource,
      qualitySource: input.ragSource,
    };
  }

  private extractJsonObject(text: string): string {
    const trimmed = text.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return trimmed;
    }

    return trimmed.slice(start, end + 1);
  }

  private clampConfidence(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
  }

  private getLlmProvider(): string {
    return (this.config.get<string>('LLM_PROVIDER') || 'mistral').toLowerCase();
  }

  private hasLlmKey(): boolean {
    const provider = this.getLlmProvider();

    if (provider === 'openai') {
      return !!this.config.get<string>('OPENAI_API_KEY');
    }

    return !!this.config.get<string>('MISTRAL_API_KEY');
  }
}
