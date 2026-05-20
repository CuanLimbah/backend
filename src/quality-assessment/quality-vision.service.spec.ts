import { generateText } from 'ai';
import { QualityVisionService } from './quality-vision.service';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../chat/llm.factory', () => ({
  getLlmModel: jest.fn(() => 'vision-model'),
}));

const mockedGenerateText = generateText as jest.Mock;

function createConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('QualityVisionService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns fallback observation when no vision key or provider is available', async () => {
    const service = new QualityVisionService(
      createConfig({ LLM_PROVIDER: 'mistral' }) as any,
    );

    const result = await service.analyzeWasteImage({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });

    expect(result.imageQuality).toBe('unclear');
    expect(result.isWasteVisible).toBe(false);
    expect(result.detectedWasteType).toBe('unknown');
    expect(result.visionConfidence).toBe(0.2);
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('returns low confidence for invalid or unclear image output', async () => {
    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        imageQuality: 'invalid',
        isWasteVisible: false,
        detectedWasteType: 'unknown',
        visualObservation: 'Foto tidak dapat dinilai karena gambar tidak valid.',
        visionConfidence: 0.9,
      }),
    });

    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
      }) as any,
    );

    const result = await service.analyzeWasteImage({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });

    expect(result.imageQuality).toBe('invalid');
    expect(result.visionConfidence).toBeLessThanOrEqual(0.35);
  });

  it('validates and returns structured JSON output', async () => {
    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        color: 'coklat gelap',
        clarity: 'agak keruh',
        sedimentLevel: 'low',
        waterVisible: false,
        foodResidueVisible: true,
        nonOrganicContaminationVisible: false,
        containerCondition: 'botol tertutup',
        visualObservation:
          'Minyak terlihat agak keruh dengan sedikit endapan di bagian bawah.',
        visionConfidence: 0.78,
      }),
    });

    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
      }) as any,
    );

    const result = await service.analyzeWasteImage({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });

    expect(result).toEqual(
      expect.objectContaining({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        sedimentLevel: 'low',
        visionConfidence: 0.78,
      }),
    );
  });

  it('does not throw when vision provider fails', async () => {
    mockedGenerateText.mockRejectedValue(new Error('vision provider failed'));

    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
      }) as any,
    );

    await expect(
      service.analyzeWasteImage({
        imageUrl: 'https://example.com/oil.jpg',
        expectedWasteType: 'oil',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        imageQuality: 'unclear',
        detectedWasteType: 'unknown',
        visionConfidence: 0.2,
      }),
    );
  });

  it('only returns observations and does not assign a grade directly', async () => {
    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat bersih.',
        visionConfidence: 0.8,
      }),
    });

    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
      }) as any,
    );

    const result = await service.analyzeWasteImage({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });

    expect(result).not.toHaveProperty('recommendedGrade');
  });
});
