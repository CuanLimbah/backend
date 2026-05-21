import { QualityAiAnalytics } from '../../common/models';
import { globalToolRegistry } from './tool.registry';
import { setQualityAuditLogService } from './explain-quality-analytics.tool';
import './explain-quality-analytics.tool';

const baseAnalytics: QualityAiAnalytics = {
  totalQualityChecks: 12,
  totalAdminDecisions: 10,
  aiAcceptedCount: 7,
  adminOverrideCount: 3,
  overrideRate: 0.3,
  agreementRate: 0.7,
  averageConfidence: 0.76,
  lowConfidenceReviewCount: 2,
  ragUsage: {
    rag: 9,
    fallback_sop: 3,
    unknown: 0,
  },
  visionUsage: {
    vision_llm: 8,
    fallback: 4,
    unknown: 0,
  },
  gradeDistribution: {
    ai: { A: 3, B: 7, C: 2 },
    admin: { A: 2, B: 6, C: 2 },
  },
  overrideMatrix: {
    'A->B': 1,
    'B->C': 2,
  },
  feedbackTagCounts: {},
  primaryOverrideReasons: {},
  aiErrorPatterns: {},
  byWasteType: {
    food: {
      totalQualityChecks: 4,
      adminOverrideCount: 1,
      averageConfidence: 0.68,
    },
    oil: {
      totalQualityChecks: 8,
      adminOverrideCount: 2,
      averageConfidence: 0.8,
    },
  },
  recentOverrides: [
    {
      submission_id: 'sub-override-1',
      waste_type: 'oil',
      ai_quality_grade: 'B',
      final_quality_grade: 'C',
      ai_quality_confidence: 0.58,
      admin_quality_notes: 'Endapan lebih banyak saat dicek manual.',
      created_at: '2026-05-21T01:00:00.000Z',
    },
  ],
};

function createService(analytics: QualityAiAnalytics = baseAnalytics) {
  return {
    getAnalytics: jest.fn().mockResolvedValue(analytics),
    createSnapshotLog: jest.fn(),
    logAiQualityChecked: jest.fn(),
    logAdminQualityDecision: jest.fn(),
  };
}

describe('explain_quality_analytics tool', () => {
  const tool = globalToolRegistry.getTool('explain_quality_analytics');

  it('asks unauthenticated users to log in', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: false },
    );

    expect(result).toBe(
      'Silakan login terlebih dahulu untuk melihat AI Quality Analytics.',
    );
    expect(service.getAnalytics).not.toHaveBeenCalled();
  });

  it('rejects authenticated non-admin users', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toBe(
      'Fitur AI Quality Analytics hanya tersedia untuk admin.',
    );
    expect(service.getAnalytics).not.toHaveBeenCalled();
  });

  it('lets admin get analytics explanation', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(service.getAnalytics).toHaveBeenCalledWith({
      startDate: undefined,
      endDate: undefined,
      wasteType: undefined,
    });
    expect(result).toContain('RINGKASAN AI QUALITY ANALYTICS');
    expect(result).toContain('INTERPRETASI PERFORMA AI');
  });

  it('passes filters to QualityAuditLogService', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        wasteType: 'oil',
      },
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(service.getAnalytics).toHaveBeenCalledWith({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      wasteType: 'oil',
    });
    expect(result).toContain(
      'Filter aktif: wasteType = Minyak Jelantah, periode 2026-05-01 sampai 2026-05-31.',
    );
  });

  it('returns helpful empty message when no data exists', async () => {
    const service = createService({
      ...baseAnalytics,
      totalQualityChecks: 0,
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toBe(
      'Belum ada data AI Quality Check yang cukup untuk dianalisis.',
    );
  });

  it('includes core metrics in the explanation', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Total AI Quality Check: 12');
    expect(result).toContain('Agreement Rate AI: 70%');
    expect(result).toContain('Override Rate Admin: 30%');
    expect(result).toContain('Rata-rata Confidence: 76%');
    expect(result).toContain('Kasus Confidence Rendah: 2');
  });

  it('includes RAG and vision usage', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('PENGGUNAAN SOP / RAG');
    expect(result).toContain('Supabase RAG: 9');
    expect(result).toContain('Fallback SOP: 3');
    expect(result).toContain('PENGGUNAAN VISION AI');
    expect(result).toContain('Vision LLM: 8');
    expect(result).toContain('Fallback vision: 4');
  });

  it('includes grade distribution and override matrix', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('DISTRIBUSI GRADE');
    expect(result).toContain('Grade A: 3');
    expect(result).toContain('Grade B: 7');
    expect(result).toContain('POLA OVERRIDE GRADE');
    expect(result).toContain('A->B: 1 kasus');
    expect(result).toContain('admin menurunkan grade dari rekomendasi AI');
    expect(result).toContain('B->C: 2 kasus');
  });

  it('describes upgrade override transitions using grade rank', async () => {
    const service = createService({
      ...baseAnalytics,
      overrideMatrix: {
        'C->B': 1,
        'B->A': 1,
      },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('C->B: 1 kasus');
    expect(result).toContain('B->A: 1 kasus');
    expect(result).toContain('admin menaikkan grade dari rekomendasi AI');
  });

  it('includes recent overrides', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('RECENT OVERRIDES');
    expect(result).toContain('sub-override-1');
    expect(result).toContain('Endapan lebih banyak saat dicek manual.');
  });

  it('recommends reviewing Supabase RAG when fallback SOP is high', async () => {
    const service = createService({
      ...baseAnalytics,
      ragUsage: { rag: 1, fallback_sop: 9, unknown: 0 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Periksa dokumen SOP di Supabase RAG');
  });

  it('recommends checking vision provider when vision fallback is high', async () => {
    const service = createService({
      ...baseAnalytics,
      visionUsage: { vision_llm: 1, fallback: 9, unknown: 0 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Periksa konfigurasi provider vision');
  });

  it('recommends reviewing prompt SOP or guideline when override rate is high', async () => {
    const service = createService({
      ...baseAnalytics,
      overrideRate: 0.5,
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain(
      'Review pola override untuk memperbaiki prompt, SOP, atau guideline admin.',
    );
  });

  it('includes feedback section when analytics has feedback counts', async () => {
    const service = createService({
      ...baseAnalytics,
      feedbackTagCounts: {
        sop_mismatch: 2,
        visual_missed_sediment: 1,
      },
      primaryOverrideReasons: {
        sop_mismatch: 2,
      },
      aiErrorPatterns: {
        ai_too_optimistic: 3,
      },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('POLA FEEDBACK ADMIN');
    expect(result).toContain('sop_mismatch: 2');
    expect(result).toContain('visual_missed_sediment: 1');
    expect(result).toContain('ai_too_optimistic: 3');
  });

  it('returns no feedback message when feedback counts are empty', async () => {
    const service = createService(baseAnalytics);
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Belum ada feedback terstruktur dari admin.');
  });

  it('recommends SOP improvement when sop mismatch is common', async () => {
    const service = createService({
      ...baseAnalytics,
      feedbackTagCounts: { sop_mismatch: 3 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Perbaiki dokumen SOP dan retrieval Supabase RAG.');
  });

  it('recommends vision prompt improvement when sediment is missed', async () => {
    const service = createService({
      ...baseAnalytics,
      feedbackTagCounts: { visual_missed_sediment: 3 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain(
      'Perkuat prompt vision untuk memperhatikan endapan dan campuran air.',
    );
  });

  it('recommends photo upload guidance when photos are unclear', async () => {
    const service = createService({
      ...baseAnalytics,
      feedbackTagCounts: { photo_unclear: 4 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('Tambahkan panduan upload foto untuk user.');
  });

  it('recommends stricter grading when AI is too optimistic', async () => {
    const service = createService({
      ...baseAnalytics,
      aiErrorPatterns: { ai_too_optimistic: 3 },
    });
    setQualityAuditLogService(service as any);

    const result = await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(result).toContain('AI cenderung terlalu optimistis');
  });

  it('does not mutate data or call write methods', async () => {
    const service = createService();
    setQualityAuditLogService(service as any);

    await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(service.createSnapshotLog).not.toHaveBeenCalled();
    expect(service.logAiQualityChecked).not.toHaveBeenCalled();
    expect(service.logAdminQualityDecision).not.toHaveBeenCalled();
  });
});
