import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';
import { z } from 'zod';
import { getLlmModel } from '../chat/llm.factory';
import type { AiVisualObservations, WasteType } from '../common/models';

const VisualObservationSchema = z.object({
  imageQuality: z.enum(['clear', 'blurry', 'dark', 'unclear', 'invalid']),
  isWasteVisible: z.boolean(),
  detectedWasteType: z.enum(['food', 'oil', 'unknown']),
  color: z.string().optional(),
  clarity: z.string().optional(),
  sedimentLevel: z
    .enum(['none', 'low', 'medium', 'high', 'unknown'])
    .optional(),
  waterVisible: z.boolean().optional(),
  foodResidueVisible: z.boolean().optional(),
  nonOrganicContaminationVisible: z.boolean().optional(),
  containerCondition: z.string().optional(),
  visualObservation: z.string().min(1),
  visionConfidence: z.number().min(0).max(1),
});

@Injectable()
export class QualityVisionService {
  constructor(private readonly config: ConfigService) {}

  async analyzeWasteImage(input: {
    imageUrl: string;
    expectedWasteType: WasteType;
  }): Promise<AiVisualObservations> {
    if (!this.canUseVision()) {
      return this.getFallbackObservation(
        'Analisis visual belum tersedia karena provider vision tidak dikonfigurasi. Admin perlu menilai foto secara manual.',
      );
    }

    try {
      const { text } = await generateText({
        model: getLlmModel(this.config),
        system: `You are AI Vision Quality Inspector for CuanLimbah.

Analyze the waste image and return visual observations only.
Expected waste type: oil or food.

For oil, observe:
- color
- clarity
- sediment
- visible water mixture
- food residue
- container condition

For food, observe:
- whether food waste is visible
- organic / non-organic contamination
- plastic, metal, glass, or packaging
- excessive liquid / rotting appearance
- separation quality

Return valid JSON only:
{
  "imageQuality": "clear" | "blurry" | "dark" | "unclear" | "invalid",
  "isWasteVisible": boolean,
  "detectedWasteType": "food" | "oil" | "unknown",
  "color": "short text",
  "clarity": "short text",
  "sedimentLevel": "none" | "low" | "medium" | "high" | "unknown",
  "waterVisible": boolean,
  "foodResidueVisible": boolean,
  "nonOrganicContaminationVisible": boolean,
  "containerCondition": "short text",
  "visualObservation": "short observation in Indonesian",
  "visionConfidence": number
}

Guardrails:
- If image is unclear, confidence <= 0.45.
- If waste is not visible, confidence <= 0.35.
- If the image does not match expectedWasteType, detectedWasteType should reflect uncertainty or mismatch.
- Do not infer lab data.
- Do not assign final quality grade.
- Do not determine payout.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  expectedWasteType: input.expectedWasteType,
                  instruction:
                    'Analisis foto limbah ini sebagai observasi visual saja.',
                }),
              },
              {
                type: 'image',
                image: new URL(input.imageUrl),
              },
            ],
          },
        ],
      });

      const parsed = VisualObservationSchema.parse(
        JSON.parse(this.extractJsonObject(text)),
      );

      return this.applyVisionSafety(parsed);
    } catch {
      return this.getFallbackObservation(
        'Analisis visual gagal dijalankan atau foto tidak dapat diakses. Admin perlu menilai foto secara manual.',
      );
    }
  }

  getModelVersion(): string {
    const provider = this.getProvider();
    return this.canUseVision()
      ? `${provider}:vision-quality-mvp-v1`
      : 'fallback:vision-quality-mvp-v1';
  }

  getSourceForObservation(observation: AiVisualObservations): 'vision_llm' | 'fallback' {
    return this.isFallbackObservation(observation)
      ? 'fallback'
      : 'vision_llm';
  }

  getFallbackObservation(visualObservation: string): AiVisualObservations {
    return {
      imageQuality: 'unclear',
      isWasteVisible: false,
      detectedWasteType: 'unknown',
      sedimentLevel: 'unknown',
      visualObservation,
      visionConfidence: 0.2,
    };
  }

  private applyVisionSafety(
    observation: AiVisualObservations,
  ): AiVisualObservations {
    let visionConfidence = this.clampConfidence(observation.visionConfidence);

    if (observation.imageQuality !== 'clear') {
      visionConfidence = Math.min(visionConfidence, 0.45);
    }

    if (!observation.isWasteVisible) {
      visionConfidence = Math.min(visionConfidence, 0.35);
    }

    if (observation.detectedWasteType === 'unknown') {
      visionConfidence = Math.min(visionConfidence, 0.45);
    }

    return {
      ...observation,
      visionConfidence,
    };
  }

  private canUseVision(): boolean {
    const provider = this.getProvider();

    if (provider === 'openai') {
      return !!this.config.get<string>('OPENAI_API_KEY');
    }

    if (provider === 'gemini') {
      return !!this.config.get<string>('GEMINI_API_KEY');
    }

    return false;
  }

  private isFallbackObservation(observation: AiVisualObservations): boolean {
    return (
      observation.imageQuality === 'unclear' &&
      !observation.isWasteVisible &&
      observation.detectedWasteType === 'unknown' &&
      observation.visionConfidence <= 0.2 &&
      (observation.visualObservation.includes('provider vision tidak dikonfigurasi') ||
        observation.visualObservation.includes('Analisis visual gagal dijalankan'))
    );
  }

  private getProvider(): string {
    return (this.config.get<string>('LLM_PROVIDER') || 'mistral').toLowerCase();
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
}
