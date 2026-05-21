import { createClient } from '@supabase/supabase-js';
import { embed } from 'ai';
import { QualityRagService } from './quality-rag.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('ai', () => ({
  embed: jest.fn(),
}));

jest.mock('../chat/llm.factory', () => ({
  getEmbeddingModel: jest.fn(() => 'embedding-model'),
}));

const mockedCreateClient = createClient as jest.Mock;
const mockedEmbed = embed as jest.Mock;

function createConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('QualityRagService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('falls back to local SOP when Supabase or embedding key is missing', async () => {
    const service = new QualityRagService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        EMBEDDING_PROVIDER: 'mistral',
      }) as any,
    );

    const result = await service.getQualityCriteria({
      wasteType: 'oil',
      conditionDescription: 'Minyak agak keruh.',
    });

    expect(result.source).toBe('fallback_sop');
    expect(mockedEmbed).not.toHaveBeenCalled();
  });

  it('rejects retrieved chunks that are not relevant to the requested waste type', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          title: 'SOP kualitas sisa makanan',
          content:
            'Kriteria grade A sisa makanan adalah dominan organik dan tidak ada plastik.',
          similarity: 0.91,
        },
      ],
      error: null,
    });

    mockedCreateClient.mockReturnValue({ rpc });
    mockedEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const service = new QualityRagService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        EMBEDDING_PROVIDER: 'mistral',
        MISTRAL_API_KEY: 'mistral-key',
      }) as any,
    );

    const result = await service.getQualityCriteria({
      wasteType: 'oil',
      conditionDescription: 'Minyak agak keruh.',
    });

    expect(result.source).toBe('fallback_sop');
  });

  it('accepts metadata-matched quality SOP chunks for the requested waste type', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          title: 'Dokumen SOP',
          content: 'Grade B: agak keruh dan ada sedikit endapan.',
          metadata: {
            wasteType: 'oil',
            documentType: 'quality_sop',
          },
          score: 0.86,
        },
      ],
      error: null,
    });

    mockedCreateClient.mockReturnValue({ rpc });
    mockedEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const service = new QualityRagService(
      createConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        EMBEDDING_PROVIDER: 'mistral',
        MISTRAL_API_KEY: 'mistral-key',
      }) as any,
    );

    const result = await service.getQualityCriteria({
      wasteType: 'oil',
      conditionDescription: 'Minyak agak keruh.',
    });

    expect(result.source).toBe('rag');
    expect(result.retrievedChunks).toHaveLength(1);
  });
});
