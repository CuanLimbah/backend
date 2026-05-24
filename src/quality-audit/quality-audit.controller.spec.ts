import { QualityAuditController } from './quality-audit.controller';

describe('QualityAuditController', () => {
  function createController() {
    const service = {
      getAnalytics: jest.fn().mockResolvedValue({
        multimodalRag: {
          retrievalQuality: { totalRetrievals: 1 },
        },
      }),
      getFinalAiEvaluationReport: jest.fn().mockResolvedValue({
        generatedAt: '2026-05-24T00:00:00.000Z',
        filters: {},
      }),
    };

    return {
      controller: new QualityAuditController(service as any),
      service,
    };
  }

  it('returns final AI evaluation report with filters', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getFinalAiEvaluationReport('2026-05-01', '2026-05-31', 'oil'),
    ).resolves.toEqual({
      generatedAt: '2026-05-24T00:00:00.000Z',
      filters: {},
    });
    expect(service.getFinalAiEvaluationReport).toHaveBeenCalledWith({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      wasteType: 'oil',
    });
  });
});
