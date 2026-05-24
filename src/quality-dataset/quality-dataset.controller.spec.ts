import { BadRequestException } from '@nestjs/common';
import { QualityDatasetController } from './quality-dataset.controller';

describe('QualityDatasetController', () => {
  function createController() {
    const service = {
      getReadinessAnalytics: jest.fn(),
      listCases: jest.fn(),
      backfillFromCompletedSubmissions: jest.fn(),
      backfillEmbeddingsForEligibleCases: jest.fn(),
      generateEmbeddingForCase: jest.fn(),
      getSimilarCasesForSubmission: jest.fn().mockResolvedValue([]),
      backfillSupabaseVectors: jest.fn().mockResolvedValue({
        scanned: 1,
        synced: 1,
        skipped: 0,
        failed: 0,
      }),
      syncCaseVectorToSupabase: jest.fn(),
      getVectorSyncStatus: jest.fn(),
      getSimilarCasesForSubmissionWithProvider: jest.fn().mockResolvedValue({
        provider: 'supabase_pgvector',
        fallbackUsed: false,
        cases: [],
      }),
    };

    return {
      controller: new QualityDatasetController(service as any),
      service,
    };
  }

  it('rejects missing submissionId for similar cases', () => {
    const { controller } = createController();

    expect(() => controller.getSimilarCases(undefined as any)).toThrow(
      BadRequestException,
    );
  });

  it('rejects empty submissionId for similar cases', () => {
    const { controller } = createController();

    expect(() => controller.getSimilarCases('   ')).toThrow(BadRequestException);
  });

  it('calls similar cases service with trimmed submissionId and numeric filters', async () => {
    const { controller, service } = createController();

    await controller.getSimilarCases(' sub-123 ', '5', '0.75');

    expect(service.getSimilarCasesForSubmission).toHaveBeenCalledWith('sub-123', {
      limit: 5,
      minSimilarity: 0.75,
    });
  });

  it('rejects non-numeric limit and minSimilarity', () => {
    const { controller } = createController();

    expect(() => controller.getSimilarCases('sub-123', 'bad')).toThrow(
      'limit harus berupa angka',
    );
    expect(() => controller.getSimilarCases('sub-123', undefined, 'bad')).toThrow(
      'minSimilarity harus berupa angka',
    );
  });

  it('rejects similar case limit outside 1 to 50 and minSimilarity outside 0 to 1', () => {
    const { controller } = createController();

    expect(() => controller.getSimilarCases('sub-123', '0')).toThrow(
      'limit harus berada di antara 1 dan 50',
    );
    expect(() => controller.getSimilarCases('sub-123', '51')).toThrow(
      'limit harus berada di antara 1 dan 50',
    );
    expect(() => controller.getSimilarCases('sub-123', undefined, '-0.1')).toThrow(
      'minSimilarity harus berada di antara 0 dan 1',
    );
    expect(() => controller.getSimilarCases('sub-123', undefined, '1.1')).toThrow(
      'minSimilarity harus berada di antara 0 dan 1',
    );
  });

  it('calls vector backfill with numeric options', async () => {
    const { controller, service } = createController();

    await controller.backfillSupabaseVectors(undefined, undefined, '10', 'true');

    expect(service.backfillSupabaseVectors).toHaveBeenCalledWith({
      limit: 10,
      force: true,
    });
  });

  it('rejects vector backfill limit above 500', () => {
    const { controller } = createController();

    expect(() =>
      controller.backfillSupabaseVectors(undefined, undefined, '501'),
    ).toThrow('limit harus berada di antara 1 dan 500');
  });

  it('rejects missing submissionId for vector similar cases', () => {
    const { controller } = createController();

    expect(() =>
      controller.getVectorSimilarCases(undefined as any),
    ).toThrow(BadRequestException);
  });

  it('calls vector similar cases with provider and trimmed submissionId', async () => {
    const { controller, service } = createController();

    await controller.getVectorSimilarCases(
      ' sub-123 ',
      '5',
      '0.8',
      'supabase_pgvector',
    );

    expect(service.getSimilarCasesForSubmissionWithProvider).toHaveBeenCalledWith(
      'sub-123',
      {
        limit: 5,
        minSimilarity: 0.8,
        provider: 'supabase_pgvector',
      },
    );
  });

  it('calls vector similar cases with provider auto by default', async () => {
    const { controller, service } = createController();

    await controller.getVectorSimilarCases(' sub-123 ', '5', '0.8');

    expect(service.getSimilarCasesForSubmissionWithProvider).toHaveBeenCalledWith(
      'sub-123',
      {
        limit: 5,
        minSimilarity: 0.8,
        provider: 'auto',
      },
    );
  });

  it('rejects invalid vector similar cases provider', () => {
    const { controller } = createController();

    expect(() =>
      controller.getVectorSimilarCases(
        'sub-123',
        '5',
        '0.8',
        'bad-provider' as any,
      ),
    ).toThrow('provider tidak valid');
  });

  it('returns provider, fallback status, and empty cases safely', async () => {
    const { controller } = createController();

    await expect(
      controller.getVectorSimilarCases('sub-123', '5', '0.8', 'auto'),
    ).resolves.toEqual({
      provider: 'supabase_pgvector',
      fallbackUsed: false,
      cases: [],
    });
  });

  it('rejects vector similar cases minSimilarity outside 0 to 1', () => {
    const { controller } = createController();

    expect(() =>
      controller.getVectorSimilarCases('sub-123', '5', '-0.1'),
    ).toThrow('minSimilarity harus berada di antara 0 dan 1');
    expect(() =>
      controller.getVectorSimilarCases('sub-123', '5', '1.1'),
    ).toThrow('minSimilarity harus berada di antara 0 dan 1');
  });
});
