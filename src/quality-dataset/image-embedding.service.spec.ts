import { embed } from 'ai';
import { ImageEmbeddingService } from './image-embedding.service';

jest.mock('ai', () => ({
  embed: jest.fn(),
}));

jest.mock('../chat/llm.factory', () => ({
  getEmbeddingModel: jest.fn(() => 'embedding-model'),
}));

const mockedEmbed = embed as jest.Mock;

describe('ImageEmbeddingService', () => {
  function createService(configValues: Record<string, string | undefined> = {}) {
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };

    return new ImageEmbeddingService(config as any);
  }

  beforeEach(() => {
    mockedEmbed.mockReset();
  });

  it('builds visual observation text', () => {
    const service = createService();

    const text = service.buildVisualObservationText({
      wasteType: 'oil',
      visualObservation: {
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        color: 'dark brown',
        clarity: 'cloudy',
        sedimentLevel: 'medium',
        waterVisible: false,
        foodResidueVisible: true,
        nonOrganicContaminationVisible: false,
        containerCondition: 'closed bottle',
        visualObservation: 'Minyak terlihat agak keruh.',
        visionConfidence: 0.8,
      },
    });

    expect(text).toContain('Waste type: oil.');
    expect(text).toContain('Sediment: medium.');
    expect(text).toContain('Notes: Minyak terlihat agak keruh.');
  });

  it('returns null gracefully when provider key is unavailable', async () => {
    const service = createService({ EMBEDDING_PROVIDER: 'gemini' });

    const result = await service.generateForQualityCase({
      wasteType: 'oil',
      visualObservation: {
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat jelas.',
        visionConfidence: 0.8,
      },
    });

    expect(result).toBeNull();
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it('returns text embedding fallback when embedding model exists', async () => {
    mockedEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    const service = createService({
      EMBEDDING_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'key',
    });

    const result = await service.generateForQualityCase({
      imageUrl: 'https://example.com/oil.jpg',
      wasteType: 'oil',
      visualObservation: {
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat jelas.',
        visionConfidence: 0.8,
      },
    });

    expect(mockedEmbed).toHaveBeenCalled();
    expect(result).toEqual({
      embedding: [0.1, 0.2, 0.3],
      model: 'gemini:text-embedding-004',
      source: 'visual_text_embedding',
    });
  });
});
