import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { generateText } from 'ai';
import { Model } from 'mongoose';
import { z } from 'zod';
import type {
  AiVisualObservations,
  ContaminationLevel,
  MultimodalRagSource,
  QualityGrade,
} from '../common/models';
import { getLlmModel } from '../chat/llm.factory';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { QualityAuditLogService } from '../quality-audit/quality-audit-log.service';
import { ImageEmbeddingService } from '../quality-dataset/image-embedding.service';
import { QualityCaseDatasetService } from '../quality-dataset/quality-case-dataset.service';
import { QualityRagService } from './quality-rag.service';
import { QualityVisionService } from './quality-vision.service';
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

type MultimodalRagMetadata = {
  used: boolean;
  source: MultimodalRagSource;
  model?: string;
  similarCaseIds: string[];
  similarCaseCount: number;
  topScore?: number;
  context?: string;
};

@Injectable()
export class QualityAssessmentService {
  private readonly logger = new Logger(QualityAssessmentService.name);

  constructor(
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    private readonly qualityRagService: QualityRagService,
    private readonly qualityVisionService: QualityVisionService,
    private readonly qualityAuditLogService: QualityAuditLogService,
    private readonly qualityCaseDatasetService: QualityCaseDatasetService,
    private readonly imageEmbeddingService: ImageEmbeddingService,
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

    const visualObservation = submission.image_url
      ? await this.qualityVisionService.analyzeWasteImage({
          imageUrl: submission.image_url,
          expectedWasteType: submission.waste_type,
        })
      : undefined;
    const multimodalRag = await this.tryBuildMultimodalRagContext({
      submission,
      visualObservation,
    });
    const ragContext = this.buildRagContext(
      conditionDescription,
      visualObservation,
    );
    const criteria = await this.qualityRagService.getQualityCriteria({
      wasteType: submission.waste_type,
      conditionDescription: ragContext,
    });

    const assessment =
      (await this.tryAssessWithLlm({
        submission,
        conditionDescription,
        visualObservation,
        similarCasesContext: multimodalRag.context,
        criteriaText: criteria.criteriaText,
        criteria: criteria.criteria,
        ragSource: criteria.source,
      })) ??
      this.assessDeterministically({
        submissionId: submission.id,
        wasteType: submission.waste_type,
        conditionDescription,
        visualObservation,
        criteria: criteria.criteria,
        ragSource: criteria.source,
      });

    const checkedAt = new Date().toISOString();

    const updatedSubmission = await this.submissionModel
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
          ai_similar_case_ids: multimodalRag.similarCaseIds,
          ai_similar_case_count: multimodalRag.similarCaseCount,
          ai_similar_case_top_score: multimodalRag.topScore,
          ai_multimodal_rag_used: multimodalRag.used,
          ai_multimodal_rag_source: multimodalRag.source,
          ai_multimodal_rag_model: multimodalRag.model,
          ...(visualObservation
            ? {
                ai_visual_observations: visualObservation,
                ai_visual_checked_at: checkedAt,
                ai_visual_model:
                  this.qualityVisionService.getModelVersionForObservation(
                    visualObservation,
                  ),
                ai_visual_source:
                  this.qualityVisionService.getSourceForObservation(
                    visualObservation,
                  ),
              }
            : {}),
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (updatedSubmission) {
      try {
        await this.qualityAuditLogService.logAiQualityChecked(updatedSubmission);
      } catch (error) {
        this.logger.warn(
          `Failed to write quality audit log: ${String(error)}`,
        );
      }

      try {
        await this.qualityCaseDatasetService.upsertFromSubmission(
          updatedSubmission,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to upsert quality case dataset: ${String(error)}`,
        );
      }
    }

    const { qualitySource: _qualitySource, ...publicResult } = assessment;
    return publicResult;
  }

  private async tryAssessWithLlm(input: {
    submission: WasteSubmissionEntity;
    conditionDescription?: string;
    visualObservation?: AiVisualObservations;
    similarCasesContext?: string;
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
3. Visual observations from QualityVisionService if available
4. SOP grading criteria retrieved from Supabase RAG or fallback SOP
5. Historical similar cases from quality_case_dataset if available

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
- If conditionDescription is vague or missing AND visual observation is also missing, unclear, blurry, invalid, low-confidence, or waste is not visible, use confidence <= 0.55.
- If conditionDescription is missing but visual observation is clear, waste is visible, detectedWasteType matches submission waste type, and SOP match is strong, confidence may be higher.
- If visual observation and admin conditionDescription conflict, lower confidence and explain that admin must review manually.
- If visual observation is unclear, blurry, invalid, or confidence <= 0.45, the final quality confidence must be <= 0.55.
- If waste is not visible, final quality confidence must be <= 0.4.
- If image detectedWasteType mismatches submission.waste_type, lower confidence and warn admin.
- Use similar historical cases as supporting context only.
- Final admin grades from similar cases are strong references, but do not copy grade blindly.
- SOP RAG remains the main policy source.
- If current visual evidence differs from historical cases, explain uncertainty and lower confidence.
- If similar cases suggest Grade B but SOP/visual evidence suggests Grade C, explain uncertainty and lower confidence.
- If conditionDescription mentions mixed water, many sediments, plastic, metal, glass, dangerous contamination, or severe rotting, recommend C.
- If conditionDescription indicates clean, separated, closed container, no water, and very little sediment, recommend A or B depending on detail.
- Never claim exact lab results.
- Never auto-approve.
- Never decide final payout.`,
        prompt: JSON.stringify({
          wasteType: input.submission.waste_type,
          conditionDescription:
            input.conditionDescription || '(tidak ada deskripsi kondisi)',
          visualObservation: input.visualObservation ?? null,
          imageUrlAvailable: Boolean(input.submission.image_url),
          sopCriteria: input.criteriaText,
          historicalSimilarCases:
            input.similarCasesContext || '(tidak ada kasus historis mirip)',
        }),
      });

      const parsed = LlmAssessmentSchema.parse(
        JSON.parse(this.extractJsonObject(text)),
      );

      return {
        submissionId: input.submission.id,
        wasteType: input.submission.waste_type,
        recommendedGrade: parsed.recommendedGrade,
        confidence: this.applyVisualConfidenceCaps(
          this.clampConfidence(parsed.confidence),
          input.submission.waste_type,
          input.visualObservation,
        ),
        contaminationLevel: parsed.contaminationLevel,
        reason: parsed.reason,
        matchedCriteria: parsed.matchedCriteria,
        tips: parsed.tips,
        requiresAdminReview: true,
        modelProvider: provider,
        modelVersion: `${provider}:quality-assessment-mvp-v1`,
        ragSource: input.ragSource,
        visualObservation: input.visualObservation,
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
    visualObservation?: AiVisualObservations;
    criteria: string[];
    ragSource: 'rag' | 'fallback_sop';
  }): InternalQualityAssessmentResult {
    const description = [
      input.conditionDescription,
      input.visualObservation?.visualObservation,
      input.visualObservation?.clarity,
      input.visualObservation?.containerCondition,
      input.visualObservation?.color,
      input.visualObservation?.sedimentLevel
        ? `endapan ${input.visualObservation.sedimentLevel}`
        : undefined,
      input.visualObservation?.waterVisible != null
        ? `air ${input.visualObservation.waterVisible ? 'terlihat' : 'tidak terlihat'}`
        : undefined,
      input.visualObservation?.foodResidueVisible != null
        ? `sisa makanan ${
            input.visualObservation.foodResidueVisible
              ? 'terlihat'
              : 'tidak terlihat'
          }`
        : undefined,
      input.visualObservation?.nonOrganicContaminationVisible != null
        ? `kontaminasi non-organik ${
            input.visualObservation.nonOrganicContaminationVisible
              ? 'terlihat'
              : 'tidak terlihat'
          }`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
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
      'air terlihat',
      'kontaminasi tinggi',
      'high contamination',
      'kemasan',
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
      input.visualObservation?.waterVisible === true ||
      input.visualObservation?.sedimentLevel === 'high' ||
      input.visualObservation?.nonOrganicContaminationVisible === true ||
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

    confidence = this.applyVisualConfidenceCaps(
      confidence,
      input.wasteType,
      input.visualObservation,
    );

    const reason = isVague
      ? 'Deskripsi kondisi masih terbatas, sehingga admin perlu inspeksi manual sebelum menentukan grade final.'
      : input.visualObservation?.detectedWasteType !== undefined &&
          input.visualObservation.detectedWasteType !== 'unknown' &&
          input.visualObservation.detectedWasteType !== input.wasteType
        ? `Rekomendasi grade ${recommendedGrade} memiliki confidence rendah karena jenis limbah pada foto tidak sepenuhnya cocok dengan data submission.`
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
      visualObservation: input.visualObservation,
      qualitySource: input.ragSource,
    };
  }

  private buildRagContext(
    conditionDescription?: string,
    visualObservation?: AiVisualObservations,
  ): string | undefined {
    return [
      conditionDescription,
      visualObservation?.visualObservation,
      visualObservation?.clarity
        ? `Kejernihan: ${visualObservation.clarity}`
        : undefined,
      visualObservation?.sedimentLevel
        ? `Endapan: ${visualObservation.sedimentLevel}`
        : undefined,
      visualObservation?.waterVisible != null
        ? `Air terlihat: ${visualObservation.waterVisible ? 'ya' : 'tidak'}`
        : undefined,
      visualObservation?.nonOrganicContaminationVisible != null
        ? `Kontaminasi non-organik: ${
            visualObservation.nonOrganicContaminationVisible ? 'ya' : 'tidak'
          }`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private async tryBuildMultimodalRagContext(input: {
    submission: WasteSubmissionEntity;
    visualObservation?: AiVisualObservations;
  }): Promise<MultimodalRagMetadata> {
    const base: MultimodalRagMetadata = {
      used: false,
      source: 'embedding_unavailable',
      similarCaseIds: [],
      similarCaseCount: 0,
    };

    try {
      const embeddingResult =
        await this.imageEmbeddingService.generateForQualityCase({
          imageUrl: input.submission.image_url,
          visualObservation: input.visualObservation,
          wasteType: input.submission.waste_type,
        });

      if (!embeddingResult) {
        return base;
      }

      const similarCases = await this.qualityCaseDatasetService.findSimilarCases({
        wasteType: input.submission.waste_type,
        embedding: embeddingResult.embedding,
        excludeSubmissionId: input.submission.id,
        limit: 5,
        minSimilarity: 0.7,
      });

      if (similarCases.length === 0) {
        return {
          used: false,
          source: 'none',
          model: embeddingResult.model,
          similarCaseIds: [],
          similarCaseCount: 0,
        };
      }

      return {
        used: true,
        source: 'similar_quality_cases',
        model: embeddingResult.model,
        similarCaseIds: similarCases.map((item) => item.submission_id),
        similarCaseCount: similarCases.length,
        topScore: similarCases[0]?.similarity,
        context:
          this.qualityCaseDatasetService.buildSimilarCasesContext(similarCases),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve similar quality cases: ${String(error)}`,
      );
      return base;
    }
  }

  private applyVisualConfidenceCaps(
    confidence: number,
    expectedWasteType: 'food' | 'oil',
    visualObservation?: AiVisualObservations,
  ): number {
    if (!visualObservation) {
      return this.clampConfidence(confidence);
    }

    let cappedConfidence = confidence;

    if (
      visualObservation.imageQuality !== 'clear' ||
      visualObservation.visionConfidence <= 0.45
    ) {
      cappedConfidence = Math.min(cappedConfidence, 0.55);
    }

    if (!visualObservation.isWasteVisible) {
      cappedConfidence = Math.min(cappedConfidence, 0.4);
    }

    if (
      visualObservation.detectedWasteType !== 'unknown' &&
      visualObservation.detectedWasteType !== expectedWasteType
    ) {
      cappedConfidence = Math.min(cappedConfidence, 0.45);
    }

    return this.clampConfidence(cappedConfidence);
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

    if (provider === 'gemini') {
      return !!this.config.get<string>('GEMINI_API_KEY');
    }

    return !!this.config.get<string>('MISTRAL_API_KEY');
  }
}
