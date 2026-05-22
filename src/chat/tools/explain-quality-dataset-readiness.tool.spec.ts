import { QualityDatasetReadinessAnalytics } from '../../common/models';
import { globalToolRegistry } from './tool.registry';
import { setQualityCaseDatasetService } from './explain-quality-dataset-readiness.tool';
import './explain-quality-dataset-readiness.tool';

const baseAnalytics: QualityDatasetReadinessAnalytics = {
  totalCases: 10,
  eligibleCases: 8,
  ineligibleCases: 2,
  eligibilityRate: 0.8,
  missingImageCount: 1,
  missingFinalGradeCount: 0,
  missingVisualObservationCount: 1,
  missingAdminValidationCount: 0,
  byWasteType: {
    food: { totalCases: 4, eligibleCases: 3, eligibilityRate: 0.75 },
    oil: { totalCases: 6, eligibleCases: 5, eligibilityRate: 0.8333 },
  },
  byFinalGrade: { A: 2, B: 5, C: 3 },
  visionSourceUsage: { vision_llm: 8, fallback: 2 },
  ragSourceUsage: { rag: 7, fallback_sop: 3 },
  feedbackTagCounts: { photo_unclear: 1 },
  aiErrorPatterns: { ai_too_optimistic: 1 },
  recentEligibleCases: [],
};

function createService(analytics = baseAnalytics) {
  return {
    getReadinessAnalytics: jest.fn().mockResolvedValue(analytics),
  };
}

describe('explain_quality_dataset_readiness tool', () => {
  const tool = globalToolRegistry.getTool('explain_quality_dataset_readiness');

  it('asks unauthenticated users to log in', async () => {
    const service = createService();
    setQualityCaseDatasetService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: false },
    );

    expect(result).toBe(
      'Silakan login terlebih dahulu untuk melihat Quality Dataset Readiness.',
    );
    expect(service.getReadinessAnalytics).not.toHaveBeenCalled();
  });

  it('rejects non-admin users', async () => {
    const service = createService();
    setQualityCaseDatasetService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toBe(
      'Fitur Quality Dataset Readiness hanya tersedia untuk admin.',
    );
    expect(service.getReadinessAnalytics).not.toHaveBeenCalled();
  });

  it('lets admin explain dataset readiness with filters', async () => {
    const service = createService();
    setQualityCaseDatasetService(service as any);

    const result = await tool?.execute(
      { wasteType: 'oil', startDate: '2026-05-01', endDate: '2026-05-31' },
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(service.getReadinessAnalytics).toHaveBeenCalledWith({
      wasteType: 'oil',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    expect(result).toContain('RINGKASAN QUALITY DATASET READINESS');
    expect(result).toContain('Dataset cukup siap untuk tahap Multimodal RAG MVP.');
  });

  it('returns not-ready interpretation for low eligibility rate', async () => {
    const service = createService({
      ...baseAnalytics,
      eligibleCases: 2,
      ineligibleCases: 8,
      eligibilityRate: 0.2,
    });
    setQualityCaseDatasetService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Dataset belum siap untuk Multimodal RAG.');
  });

  it('returns empty message when no dataset cases exist', async () => {
    const service = createService({ ...baseAnalytics, totalCases: 0 });
    setQualityCaseDatasetService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toBe('Belum ada quality case dataset yang bisa dianalisis.');
  });
});
