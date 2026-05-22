import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { embed } from 'ai';
import type {
  AiVisualObservations,
  ImageEmbeddingSource,
  WasteType,
} from '../common/models';
import { getEmbeddingModel } from '../chat/llm.factory';

type EmbeddingResult = {
  embedding: number[];
  model: string;
  source: ImageEmbeddingSource;
};

@Injectable()
export class ImageEmbeddingService {
  private readonly logger = new Logger(ImageEmbeddingService.name);

  constructor(private readonly config: ConfigService) {}

  async generateForQualityCase(input: {
    imageUrl?: string;
    visualObservation?: AiVisualObservations;
    wasteType: WasteType;
  }): Promise<EmbeddingResult | null> {
    const text = this.buildVisualObservationText(input);

    if (!text || !this.hasEmbeddingKey()) {
      return null;
    }

    try {
      const { embedding } = await embed({
        model: getEmbeddingModel(this.config),
        value: text,
      });

      if (!Array.isArray(embedding) || embedding.length === 0) {
        return null;
      }

      return {
        embedding,
        model: this.getModelVersion(),
        source: 'visual_text_embedding',
      };
    } catch (error) {
      this.logger.warn(`Failed to generate quality case embedding: ${String(error)}`);
      return null;
    }
  }

  buildVisualObservationText(input: {
    imageUrl?: string;
    visualObservation?: AiVisualObservations;
    wasteType: WasteType;
  }): string {
    const observation = input.visualObservation;

    if (!observation) {
      return '';
    }

    return [
      `Waste type: ${input.wasteType}.`,
      `Detected waste type: ${observation.detectedWasteType}.`,
      `Image quality: ${observation.imageQuality}.`,
      `Waste visible: ${observation.isWasteVisible}.`,
      observation.color ? `Color: ${observation.color}.` : undefined,
      observation.clarity ? `Clarity: ${observation.clarity}.` : undefined,
      observation.sedimentLevel
        ? `Sediment: ${observation.sedimentLevel}.`
        : undefined,
      observation.waterVisible != null
        ? `Water visible: ${observation.waterVisible}.`
        : undefined,
      observation.foodResidueVisible != null
        ? `Food residue visible: ${observation.foodResidueVisible}.`
        : undefined,
      observation.nonOrganicContaminationVisible != null
        ? `Non-organic contamination: ${observation.nonOrganicContaminationVisible}.`
        : undefined,
      observation.containerCondition
        ? `Container condition: ${observation.containerCondition}.`
        : undefined,
      `Notes: ${observation.visualObservation}`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  getModelVersion(): string {
    const provider = this.getEmbeddingProvider();

    if (provider === 'openai') return 'openai:text-embedding-3-small';
    if (provider === 'gemini') return 'gemini:text-embedding-004';
    if (provider === 'mistral') return 'mistral:mistral-embed';

    return 'text-embedding-visual-observation-mvp-v1';
  }

  private getEmbeddingProvider(): string {
    return (
      this.config.get<string>('EMBEDDING_PROVIDER') || 'mistral'
    ).toLowerCase();
  }

  private hasEmbeddingKey(): boolean {
    const provider = this.getEmbeddingProvider();

    if (provider === 'openai') return !!this.config.get<string>('OPENAI_API_KEY');
    if (provider === 'gemini') return !!this.config.get<string>('GEMINI_API_KEY');

    return !!this.config.get<string>('MISTRAL_API_KEY');
  }
}
