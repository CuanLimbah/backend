import { QualityAuditLogService } from './quality-audit-log.service';

function createFindQuery<T>(value: T) {
  return {
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

const baseSubmission = {
  id: 'sub-1',
  user_id: 'user-1',
  waste_type: 'oil',
  estimated_weight: 10,
  actual_weight: 10,
  status: 'completed',
  created_at: '2026-05-21T00:00:00.000Z',
  ai_quality_grade: 'B',
  ai_quality_confidence: 0.78,
  ai_contamination_level: 'low',
  ai_quality_reason: 'Minyak agak keruh.',
  ai_quality_rag_source: 'rag',
  ai_quality_model: 'deterministic:quality-assessment-mvp-v1',
  ai_quality_source: 'fallback_sop',
  ai_visual_source: 'vision_llm',
  ai_visual_model: 'gemini:vision-quality-mvp-v1',
  ai_visual_observations: {
    imageQuality: 'clear',
    isWasteVisible: true,
    detectedWasteType: 'oil',
    visualObservation: 'Minyak terlihat agak keruh.',
    visionConfidence: 0.78,
  },
  quality_grade: 'B',
  quality_grade_source: 'ai',
  admin_quality_notes: 'Sesuai rekomendasi AI.',
  quality_feedback: {
    tags: ['admin_manual_inspection'],
    primaryReason: 'admin_manual_inspection',
    severity: 'low',
    note: 'Sesuai rekomendasi AI.',
    created_at: '2026-05-21T01:00:00.000Z',
    created_by: 'admin-1',
  },
  override_reason_tags: ['admin_manual_inspection'],
  override_primary_reason: 'admin_manual_inspection',
  override_feedback_severity: 'low',
  price_snapshot_per_kg: 3000,
  final_price_per_kg: 2550,
  earnings: 25500,
};

describe('QualityAuditLogService', () => {
  function createService(logs: Array<Record<string, unknown>> = []) {
    const findQuery = createFindQuery(logs);
    const model = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(findQuery),
    };

    return {
      service: new QualityAuditLogService(model as any),
      model,
      findQuery,
    };
  }

  it('creates ai_quality_checked audit logs with RAG, vision, and pricing fields', async () => {
    const { service, model } = createService();

    await service.logAiQualityChecked(baseSubmission as any);

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^qal-/),
        submission_id: 'sub-1',
        user_id: 'user-1',
        waste_type: 'oil',
        event_type: 'ai_quality_checked',
        ai_quality_grade: 'B',
        ai_quality_rag_source: 'rag',
        ai_visual_source: 'vision_llm',
        ai_visual_model: 'gemini:vision-quality-mvp-v1',
        ai_visual_observations: expect.objectContaining({
          imageQuality: 'clear',
        }),
        actual_weight: 10,
        price_snapshot_per_kg: 3000,
        final_price_per_kg: 2550,
        earnings: 25500,
        is_overridden: false,
      }),
    );
  });

  it('creates admin_verified log when final grade equals AI grade', async () => {
    const { service, model } = createService();

    await service.logAdminQualityDecision({
      submission: baseSubmission as any,
      adminId: 'admin-1',
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'admin_verified',
        final_quality_grade: 'B',
        admin_id: 'admin-1',
        quality_feedback: expect.objectContaining({
          primaryReason: 'admin_manual_inspection',
        }),
        override_reason_tags: ['admin_manual_inspection'],
        override_primary_reason: 'admin_manual_inspection',
        override_feedback_severity: 'low',
        is_overridden: false,
      }),
    );
  });

  it('creates admin_overridden log and override fields when final grade differs', async () => {
    const { service, model } = createService();

    await service.logAdminQualityDecision({
      submission: {
        ...baseSubmission,
        ai_quality_grade: 'C',
        quality_grade: 'A',
        quality_grade_source: 'admin',
      } as any,
      adminId: 'admin-1',
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'admin_overridden',
        is_overridden: true,
        override_from: 'C',
        override_to: 'A',
      }),
    );
  });

  it('classifies AI error pattern from override primary reason when available', async () => {
    const { service, model } = createService();

    await service.logAdminQualityDecision({
      submission: {
        ...baseSubmission,
        ai_quality_grade: 'A',
        quality_grade: 'C',
        override_primary_reason: 'visual_missed_water',
      } as any,
      adminId: 'admin-1',
    });

    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'admin_overridden',
        ai_error_pattern: 'visual_missed_water',
      }),
    );
  });

  it('classifies AI too optimistic and too conservative from grade rank', async () => {
    const { service, model } = createService();

    await service.logAdminQualityDecision({
      submission: {
        ...baseSubmission,
        override_primary_reason: undefined,
        ai_quality_grade: 'A',
        quality_grade: 'C',
      } as any,
      adminId: 'admin-1',
    });
    await service.logAdminQualityDecision({
      submission: {
        ...baseSubmission,
        override_primary_reason: undefined,
        ai_quality_grade: 'C',
        quality_grade: 'A',
      } as any,
      adminId: 'admin-1',
    });

    expect(model.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ai_error_pattern: 'ai_too_optimistic' }),
    );
    expect(model.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ai_error_pattern: 'ai_too_conservative' }),
    );
  });

  it('calculates analytics metrics safely', async () => {
    const { service } = createService([
      {
        event_type: 'ai_quality_checked',
        waste_type: 'oil',
        ai_quality_grade: 'B',
        ai_quality_confidence: 0.8,
        ai_quality_rag_source: 'rag',
        ai_visual_source: 'vision_llm',
        is_overridden: false,
        created_at: '2026-05-20T00:00:00.000Z',
      },
      {
        event_type: 'ai_quality_checked',
        waste_type: 'food',
        ai_quality_grade: 'C',
        ai_quality_confidence: 0.4,
        ai_quality_rag_source: 'fallback_sop',
        ai_visual_source: 'fallback',
        is_overridden: false,
        created_at: '2026-05-21T00:00:00.000Z',
      },
      {
        event_type: 'admin_verified',
        waste_type: 'oil',
        ai_quality_grade: 'B',
        final_quality_grade: 'B',
        is_overridden: false,
        created_at: '2026-05-21T01:00:00.000Z',
      },
      {
        event_type: 'admin_verified',
        waste_type: 'oil',
        final_quality_grade: 'A',
        is_overridden: false,
        created_at: '2026-05-21T01:30:00.000Z',
      },
      {
        event_type: 'admin_overridden',
        submission_id: 'sub-2',
        waste_type: 'food',
        ai_quality_grade: 'C',
        final_quality_grade: 'A',
        ai_quality_confidence: 0.4,
        admin_quality_notes: 'Inspeksi manual lebih bersih.',
        is_overridden: true,
        override_from: 'C',
        override_to: 'A',
        override_reason_tags: ['sop_mismatch', 'visual_missed_sediment'],
        override_primary_reason: 'sop_mismatch',
        ai_error_pattern: 'sop_mismatch',
        created_at: '2026-05-21T02:00:00.000Z',
      },
    ]);

    const analytics = await service.getAnalytics();

    expect(analytics.totalQualityChecks).toBe(2);
    expect(analytics.totalAdminDecisions).toBe(3);
    expect(analytics.adminOverrideCount).toBe(1);
    expect(analytics.aiAcceptedCount).toBe(1);
    expect(analytics.overrideRate).toBe(0.5);
    expect(analytics.agreementRate).toBe(0.5);
    expect(analytics.averageConfidence).toBe(0.6);
    expect(analytics.lowConfidenceReviewCount).toBe(1);
    expect(analytics.ragUsage).toEqual(
      expect.objectContaining({ rag: 1, fallback_sop: 1 }),
    );
    expect(analytics.visionUsage).toEqual(
      expect.objectContaining({ vision_llm: 1, fallback: 1 }),
    );
    expect(analytics.gradeDistribution.ai).toEqual({ A: 0, B: 1, C: 1 });
    expect(analytics.gradeDistribution.admin).toEqual({ A: 2, B: 1, C: 0 });
    expect(analytics.overrideMatrix).toEqual({ 'C->A': 1 });
    expect(analytics.feedbackTagCounts).toEqual({
      sop_mismatch: 1,
      visual_missed_sediment: 1,
    });
    expect(analytics.primaryOverrideReasons).toEqual({ sop_mismatch: 1 });
    expect(analytics.aiErrorPatterns).toEqual({ sop_mismatch: 1 });
    expect(analytics.byWasteType.food.adminOverrideCount).toBe(1);
    expect(analytics.recentOverrides).toHaveLength(1);
  });

  it('does not count admin decisions without AI grade as AI accepted', async () => {
    const { service } = createService([
      {
        event_type: 'admin_verified',
        waste_type: 'oil',
        final_quality_grade: 'A',
        is_overridden: false,
        created_at: '2026-05-21T00:00:00.000Z',
      },
      {
        event_type: 'admin_verified',
        waste_type: 'oil',
        ai_quality_grade: 'B',
        final_quality_grade: 'B',
        is_overridden: false,
        created_at: '2026-05-21T01:00:00.000Z',
      },
    ]);

    const analytics = await service.getAnalytics();

    expect(analytics.totalAdminDecisions).toBe(2);
    expect(analytics.aiAcceptedCount).toBe(1);
    expect(analytics.adminOverrideCount).toBe(0);
    expect(analytics.agreementRate).toBe(1);
    expect(analytics.overrideRate).toBe(0);
  });

  it('filters analytics by wasteType and date range', async () => {
    const { service, model } = createService([]);

    await service.getAnalytics({
      wasteType: 'food',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-31T23:59:59.999Z',
    });

    expect(model.find).toHaveBeenCalledWith({
      waste_type: 'food',
      created_at: {
        $gte: '2026-05-01T00:00:00.000Z',
        $lte: '2026-05-31T23:59:59.999Z',
      },
    });
  });
});
