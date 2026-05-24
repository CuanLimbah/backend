import { createClient } from '@supabase/supabase-js';
import { SupabaseQualityVectorService } from './supabase-quality-vector.service';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = createClient as jest.Mock;

const baseCase = {
  id: 'qcd-1',
  submission_id: 'sub-1',
  user_id: 'user-1',
  waste_type: 'oil',
  image_url: 'https://example.com/oil.jpg',
  ai_visual_observations: {
    imageQuality: 'clear',
    isWasteVisible: true,
    detectedWasteType: 'oil',
    visualObservation: 'Minyak agak keruh.',
    visionConfidence: 0.8,
  },
  final_quality_grade: 'B',
  ai_quality_grade: 'B',
  ai_quality_confidence: 0.8,
  ai_visual_source: 'vision_llm',
  ai_quality_rag_source: 'rag',
  quality_feedback: { tags: [], created_at: '2026-05-22T00:00:00.000Z' },
  is_overridden: false,
  image_embedding: Array.from({ length: 1024 }, (_, index) => index / 1024),
  image_embedding_model: 'mistral:mistral-embed',
  image_embedding_source: 'visual_text_embedding',
  eligibility_status: 'eligible',
  eligibility_reasons: [],
  created_at: '2026-05-21T00:00:00.000Z',
  updated_at: '2026-05-22T00:00:00.000Z',
};

function createExecQuery(value: unknown) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

function createService(options: {
  env?: Record<string, string | undefined>;
  supabase?: Record<string, unknown>;
  findValue?: unknown;
  embeddingResult?: unknown;
} = {}) {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    QUALITY_CASE_VECTOR_PROVIDER: 'supabase_pgvector',
    QUALITY_CASE_VECTOR_DIMENSIONS: '1024',
    ...options.env,
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
  };
  const model = {
    findOne: jest.fn().mockReturnValue(createExecQuery(baseCase)),
    find: jest.fn().mockReturnValue(createExecQuery(options.findValue ?? [])),
    findOneAndUpdate: jest.fn().mockReturnValue(createExecQuery({})),
  };
  const imageEmbeddingService = {
    buildVisualObservationText: jest.fn(() => 'Waste type: oil. Notes: Minyak agak keruh.'),
    generateForQualityCase: jest.fn().mockResolvedValue(options.embeddingResult),
  };
  const upsertSingle = jest.fn().mockResolvedValue({ data: { id: 'vec-1' }, error: null });
  const upsertSelect = jest.fn(() => ({ single: upsertSingle }));
  const upsert = jest.fn(() => ({ select: upsertSelect }));
  const rpc = jest.fn().mockResolvedValue({
    data: [
      {
        submission_id: 'sub-old',
        waste_type: 'oil',
        final_quality_grade: 'B',
        visual_observation_text: 'Minyak agak keruh.',
        similarity: 0.86,
        created_at: '2026-05-20T00:00:00.000Z',
      },
    ],
    error: null,
  });
  const supabase = {
    from: jest.fn(() => ({ upsert })),
    rpc,
    ...(options.supabase ?? {}),
  };
  mockedCreateClient.mockReturnValue(supabase);

  return {
    service: new SupabaseQualityVectorService(
      config as any,
      model as any,
      imageEmbeddingService as any,
    ),
    config,
    model,
    imageEmbeddingService,
    supabase,
    upsert,
    rpc,
  };
}

describe('SupabaseQualityVectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is disabled when Supabase env is missing', () => {
    const { service } = createService({
      env: { SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    });

    expect(service.isEnabled()).toBe(false);
  });

  it('builds quality vector payload without personal data beyond user id', () => {
    const { service } = createService();

    const payload = service.buildQualityVectorPayload(baseCase as any);

    expect(payload).toEqual(
      expect.objectContaining({
        submission_id: 'sub-1',
        user_id: 'user-1',
        waste_type: 'oil',
        visual_observation_text: 'Waste type: oil. Notes: Minyak agak keruh.',
        final_quality_grade: 'B',
      }),
    );
    expect(payload).not.toHaveProperty('wallet');
    expect(payload).not.toHaveProperty('transaction');
  });

  it('skips ineligible case sync', async () => {
    const { service, model } = createService();

    const result = await service.upsertCaseVector({
      ...baseCase,
      eligibility_status: 'missing_image',
    } as any);

    expect(result.status).toBe('skipped');
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          supabase_vector_sync_status: 'skipped',
        }),
      }),
    );
  });

  it('upserts into Supabase and stores synced status', async () => {
    const { service, upsert, model } = createService();

    const result = await service.upsertCaseVector(baseCase as any);

    expect(result).toEqual(
      expect.objectContaining({ status: 'synced', supabaseVectorId: 'vec-1' }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ submission_id: 'sub-1' }),
      { onConflict: 'submission_id' },
    );
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          supabase_vector_synced: true,
          supabase_vector_sync_status: 'synced',
        }),
      }),
    );
  });

  it('fails sync on embedding dimension mismatch', async () => {
    const { service } = createService();

    const result = await service.upsertCaseVector({
      ...baseCase,
      image_embedding: [0.1, 0.2],
    } as any);

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('Embedding dimension mismatch');
  });

  it('calls match_quality_cases RPC and maps results', async () => {
    const { service, rpc } = createService();

    const result = await service.findSimilarCases({
      wasteType: 'oil',
      embedding: baseCase.image_embedding,
      excludeSubmissionId: 'sub-1',
      limit: 5,
      minSimilarity: 0.72,
    });

    expect(rpc).toHaveBeenCalledWith('match_quality_cases', {
      query_embedding: baseCase.image_embedding,
      filter_waste_type: 'oil',
      match_threshold: 0.72,
      match_count: 5,
      exclude_submission_id: 'sub-1',
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        submission_id: 'sub-old',
        similarity: 0.86,
      }),
    );
  });

  it('clamps RPC match_count and match_threshold', async () => {
    const { service, rpc } = createService();

    await service.findSimilarCases({
      wasteType: 'oil',
      embedding: baseCase.image_embedding,
      limit: 999,
      minSimilarity: 9,
    });

    expect(rpc).toHaveBeenCalledWith(
      'match_quality_cases',
      expect.objectContaining({
        match_count: 50,
        match_threshold: 1,
      }),
    );
  });

  it('uses env default topK and threshold when params are omitted', async () => {
    const { service, rpc } = createService({
      env: {
        QUALITY_CASE_VECTOR_TOP_K: '7',
        QUALITY_CASE_VECTOR_MATCH_THRESHOLD: '0.66',
      },
    });

    await service.findSimilarCases({
      wasteType: 'oil',
      embedding: baseCase.image_embedding,
    });

    expect(rpc).toHaveBeenCalledWith(
      'match_quality_cases',
      expect.objectContaining({
        match_count: 7,
        match_threshold: 0.66,
      }),
    );
  });

  it('returns empty results when RPC fails', async () => {
    const { service } = createService({
      supabase: {
        rpc: jest.fn().mockResolvedValue({ data: null, error: new Error('rpc down') }),
      },
    });

    await expect(
      service.findSimilarCases({
        wasteType: 'oil',
        embedding: baseCase.image_embedding,
      }),
    ).resolves.toEqual([]);
  });
});
