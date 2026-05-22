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

  it('calls vector backfill with numeric options', async () => {
    const { controller, service } = createController();

    await controller.backfillSupabaseVectors(undefined, undefined, '10', 'true');

    expect(service.backfillSupabaseVectors).toHaveBeenCalledWith({
      limit: 10,
      force: true,
    });
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
});
