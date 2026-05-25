import { generateText } from 'ai';
import { QualityVisionService } from './quality-vision.service';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('../chat/llm.factory', () => ({
  getLlmModel: jest.fn(() => 'vision-model'),
  getVisionModel: jest.fn(() => 'vision-model'),
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

  it('returns fallback model version when observation source is fallback', () => {
    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'openai-key',
      }) as any,
    );

    const observation = service.getFallbackObservation(
      'Analisis visual gagal dijalankan atau foto tidak dapat diakses. Admin perlu menilai foto secara manual.',
    );

    expect(service.getModelVersionForObservation(observation)).toBe(
      'fallback:vision-quality-mvp-v1',
    );
  });

  it('returns provider model version when observation source is vision_llm', () => {
    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
      }) as any,
    );

    expect(
      service.getModelVersionForObservation({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat agak keruh.',
        visionConfidence: 0.78,
      }),
    ).toBe('gemini:vision-quality-mvp-v1');
  });

  it('uses VISION_PROVIDER independently from LLM_PROVIDER', async () => {
    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat jernih.',
        visionConfidence: 0.81,
      }),
    });

    const service = new QualityVisionService(
      createConfig({
        LLM_PROVIDER: 'mistral',
        VISION_PROVIDER: 'gemini',
        MISTRAL_API_KEY: 'mistral-key',
        GEMINI_API_KEY: 'gemini-key',
      }) as any,
    );

    const result = await service.analyzeWasteImage({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });

    expect(mockedGenerateText).toHaveBeenCalled();
    expect(result.imageQuality).toBe('clear');
    expect(service.getModelVersion()).toBe('gemini:vision-quality-mvp-v1');
  });

  it('passes uploaded data URL images directly to the vision provider', async () => {
    mockedGenerateText.mockResolvedValue({
      text: JSON.stringify({
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Minyak terlihat coklat muda.',
        visionConfidence: 0.76,
      }),
    });

    const service = new QualityVisionService(
      createConfig({
        VISION_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-key',
      }) as any,
    );
    const imageUrl = 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ==';

    await service.analyzeWasteImage({
      imageUrl,
      expectedWasteType: 'oil',
    });

    const call = mockedGenerateText.mock.calls[0]?.[0];
    expect(call.messages[0].content[1].image).toBe(imageUrl);
  });
});
