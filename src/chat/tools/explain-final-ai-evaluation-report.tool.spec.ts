import './explain-final-ai-evaluation-report.tool';
import { globalToolRegistry } from './tool.registry';
import { setFinalAiEvaluationReportService } from './explain-final-ai-evaluation-report.tool';

const baseReport = {
  generatedAt: '2026-05-24T00:00:00.000Z',
  filters: {},
  summary: {
    totalAiQualityChecks: 12,
    totalAdminDecisions: 6,
    agreementRate: 0.83,
    overrideRate: 0.17,
    averageConfidence: 0.81,
    readinessStatus: 'ready',
  },
  vision: {
    visionLlmCount: 10,
    fallbackCount: 2,
    visionUsageRate: 0.83,
  },
  sopRag: {
    ragCount: 9,
    fallbackSopCount: 3,
    ragUsageRate: 0.75,
  },
  multimodalRag: {
    usedCount: 8,
    usageRate: 0.67,
    providerUsage: {
      supabase_pgvector: 7,
      application_cosine: 1,
      fallback_none: 2,
      embedding_unavailable: 1,
      unknown: 0,
    },
    averageTopSimilarity: 0.84,
    averageSimilarCaseCount: 3,
    noResultRetrievals: 2,
    embeddingUnavailableRetrievals: 1,
  },
  dataset: {
    totalEligibleCases: 20,
    embeddingCoverageRate: 0.9,
    supabaseVectorSyncCoverageRate: 0.85,
  },
  qualityOutcomes: {
    gradeDistributionAi: { A: 4, B: 6, C: 2 },
    gradeDistributionAdmin: { A: 3, B: 7, C: 2 },
    mostCommonOverrideReasons: { ai_too_optimistic: 2 },
    mostCommonAiErrorPatterns: { ai_too_optimistic: 2 },
  },
  recommendations: ['Lanjutkan monitoring berkala.'],
  risks: ['Tidak ada risiko dominan dari data saat ini.'],
  demoReadinessChecklist: [
    {
      label: 'AI Quality Check available',
      status: 'pass',
      detail: '12 AI Quality Check tercatat.',
    },
  ],
};

describe('explain_final_ai_evaluation_report tool', () => {
  it('requires authentication', async () => {
    const tool = globalToolRegistry.getTool('explain_final_ai_evaluation_report');

    await expect(
      tool?.execute({}, { userId: 'u1', isAuthenticated: false }),
    ).resolves.toContain('Silakan login');
  });

  it('requires admin role', async () => {
    const tool = globalToolRegistry.getTool('explain_final_ai_evaluation_report');

    await expect(
      tool?.execute({}, { userId: 'u1', isAuthenticated: true, role: 'user' }),
    ).resolves.toContain('hanya tersedia untuk admin');
  });

  it('explains final AI evaluation report sections', async () => {
    const tool = globalToolRegistry.getTool('explain_final_ai_evaluation_report');
    const service = {
      getFinalAiEvaluationReport: jest.fn().mockResolvedValue(baseReport),
    };
    setFinalAiEvaluationReportService(service as any);

    const output = await tool?.execute(
      { wasteType: 'oil' },
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(service.getFinalAiEvaluationReport).toHaveBeenCalledWith({
      wasteType: 'oil',
    });
    expect(output).toContain('RINGKASAN EVALUASI AI');
    expect(output).toContain('MULTIMODAL RAG & SUPABASE PGVECTOR');
    expect(output).toContain('REKOMENDASI');
    expect(output).toContain('DEMO READINESS CHECKLIST');
    expect(output).toContain('AI hanya memberi rekomendasi kualitas');
  });
});
