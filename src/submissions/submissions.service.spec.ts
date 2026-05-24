import { SubmissionsService } from './submissions.service';

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('SubmissionsService', () => {
  function createService(overrides?: {
    submission?: Record<string, unknown>;
    pricingResult?: Record<string, unknown>;
  }) {
    const submission = {
      id: 'sub-1',
      user_id: 'user-1',
      waste_type: 'oil',
      estimated_weight: 10,
      price_snapshot_per_kg: 3000,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...overrides?.submission,
    };
    const pricingResult = {
      wasteType: 'oil',
      weightKg: 10,
      qualityGrade: 'B',
      basePricePerKg: 3000,
      qualityMultiplier: 0.85,
      volumeMultiplier: 1,
      finalPricePerKg: 2550,
      finalPricePerUnit: 2550,
      quantity: 10,
      unit: 'liter',
      quantityLabel: 'Volume',
      basePricePerUnit: 3000,
      earnings: 25500,
      pricingModelVersion: 'dynamic-pricing-mvp-v1',
      breakdown: { zeroPayout: false },
      explanation: 'Cuan final untuk 10 Liter minyak jelantah grade B adalah Rp 25.500.',
      ...overrides?.pricingResult,
    };
    const updatedSubmission = {
      ...submission,
      status: 'completed',
      actual_weight: pricingResult.weightKg,
      quality_grade: pricingResult.qualityGrade,
      final_price_per_kg: pricingResult.finalPricePerKg,
      earnings: pricingResult.earnings,
      pricing_model_version: pricingResult.pricingModelVersion,
      pricing_breakdown: pricingResult.breakdown,
      pricing_explanation: pricingResult.explanation,
    };
    const submissionModel = {
      findOne: jest.fn().mockReturnValue(queryResult(submission)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryResult(updatedSubmission)),
    };
    const transactionModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    const dropPointModel = {
      findOne: jest.fn().mockReturnValue(queryResult(null)),
    };
    const activityQueue = {
      add: jest.fn().mockResolvedValue({}),
    };
    const mediaQueue = {
      add: jest.fn().mockResolvedValue({}),
    };
    const cloudinaryService = {
      isDataUrl: jest.fn().mockReturnValue(false),
    };
    const pricingService = {
      getCurrentBasePricePerKg: jest.fn().mockResolvedValue(3000),
      calculateFinalPrice: jest.fn().mockResolvedValue(pricingResult),
    };
    const qualityAuditLogService = {
      logAdminQualityDecision: jest.fn().mockResolvedValue(undefined),
    };
    const qualityCaseDatasetService = {
      upsertFromSubmission: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SubmissionsService(
      submissionModel as any,
      transactionModel as any,
      dropPointModel as any,
      activityQueue as any,
      mediaQueue as any,
      cloudinaryService as any,
      pricingService as any,
      qualityAuditLogService as any,
      qualityCaseDatasetService as any,
    );

    return {
      service,
      submissionModel,
      transactionModel,
      pricingService,
      qualityAuditLogService,
      qualityCaseDatasetService,
    };
  }

  it('uses PricingService when verifying a submission with quality grade', async () => {
    const {
      service,
      submissionModel,
      transactionModel,
      pricingService,
      qualityAuditLogService,
      qualityCaseDatasetService,
    } =
      createService();

    const result = await service.verify(
      'sub-1',
      { actualWeight: 10, qualityGrade: 'B' },
      'admin-1',
    );

    expect(pricingService.calculateFinalPrice).toHaveBeenCalledWith({
      wasteType: 'oil',
      weightKg: 10,
      qualityGrade: 'B',
      priceSnapshotPerKg: 3000,
      useLatestPrice: false,
    });
    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        actual_weight: 10,
        quality_grade: 'B',
        quality_grade_source: 'admin',
        final_price_per_kg: 2550,
        earnings: 25500,
        pricing_model_version: 'dynamic-pricing-mvp-v1',
      }),
      { new: true },
    );
    expect(transactionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deposit',
        amount: 25500,
        status: 'completed',
        submission_id: 'sub-1',
      }),
    );
    expect(qualityAuditLogService.logAdminQualityDecision).toHaveBeenCalledWith({
      submission: expect.objectContaining({
        id: 'sub-1',
        quality_grade: 'B',
      }),
      adminId: 'admin-1',
    });
    expect(qualityCaseDatasetService.upsertFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sub-1',
        quality_grade: 'B',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        quantity_unit: 'liter',
        quantity_label: 'Volume',
        price_unit_label: 'Rp/liter',
      }),
    );
  });

  it('adds kg unit labels for food submission responses', async () => {
    const { service } = createService({
      submission: {
        waste_type: 'food',
        price_snapshot_per_kg: 1000,
      },
      pricingResult: {
        wasteType: 'food',
        qualityGrade: 'A',
        basePricePerKg: 1000,
        basePricePerUnit: 1000,
        finalPricePerKg: 1000,
        finalPricePerUnit: 1000,
        earnings: 10000,
        unit: 'kg',
        quantityLabel: 'Berat',
      },
    });

    const result = await service.verify(
      'sub-1',
      { actualWeight: 10, qualityGrade: 'A' },
      'admin-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        quantity_unit: 'kg',
        quantity_label: 'Berat',
        price_unit_label: 'Rp/kg',
      }),
    );
  });

  it('keeps old verify payloads working by defaulting qualityGrade to A', async () => {
    const { service, pricingService } = createService({
      pricingResult: {
        qualityGrade: 'A',
        finalPricePerKg: 3000,
        earnings: 30000,
      },
    });

    await service.verify('sub-1', { actualWeight: 10 }, 'admin-1');

    expect(pricingService.calculateFinalPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGrade: 'A',
      }),
    );
  });

  it('stores ai quality grade source while pricing uses final qualityGrade', async () => {
    const { service, submissionModel, pricingService } = createService({
      submission: {
        ai_quality_grade: 'C',
      },
      pricingResult: {
        qualityGrade: 'B',
        finalPricePerKg: 2550,
        earnings: 25500,
      },
    });

    await service.verify(
      'sub-1',
      {
        actualWeight: 10,
        qualityGrade: 'B',
        qualityGradeSource: 'ai',
        adminQualityNotes: 'Admin memakai rekomendasi AI.',
      },
      'admin-1',
    );

    expect(pricingService.calculateFinalPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGrade: 'B',
      }),
    );
    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        quality_grade: 'B',
        quality_grade_source: 'ai',
        admin_quality_notes: 'Admin memakai rekomendasi AI.',
      }),
      { new: true },
    );
  });

  it('stores admin quality grade source when admin overrides AI recommendation', async () => {
    const { service, submissionModel, pricingService } = createService({
      submission: {
        ai_quality_grade: 'C',
      },
      pricingResult: {
        qualityGrade: 'A',
        finalPricePerKg: 3000,
        earnings: 30000,
      },
    });

    await service.verify(
      'sub-1',
      {
        actualWeight: 10,
        qualityGrade: 'A',
        qualityGradeSource: 'admin',
        adminQualityNotes: 'Kondisi dicek ulang manual.',
      },
      'admin-1',
    );

    expect(pricingService.calculateFinalPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGrade: 'A',
      }),
    );
    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        quality_grade: 'A',
        quality_grade_source: 'admin',
        admin_quality_notes: 'Kondisi dicek ulang manual.',
      }),
      { new: true },
    );
  });

  it('stores structured quality feedback when provided', async () => {
    const { service, submissionModel } = createService({
      submission: {
        ai_quality_grade: 'A',
      },
      pricingResult: {
        qualityGrade: 'C',
        finalPricePerKg: 1800,
        earnings: 18000,
      },
    });

    await service.verify(
      'sub-1',
      {
        actualWeight: 10,
        qualityGrade: 'C',
        qualityGradeSource: 'admin',
        adminQualityNotes: 'Admin melihat air dan endapan banyak.',
        overrideReasonTags: ['visual_missed_water', 'visual_missed_sediment'],
        overridePrimaryReason: 'visual_missed_water',
        overrideFeedbackSeverity: 'high',
      },
      'admin-1',
    );

    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        quality_feedback: expect.objectContaining({
          tags: ['visual_missed_water', 'visual_missed_sediment'],
          primaryReason: 'visual_missed_water',
          severity: 'high',
          note: 'Admin melihat air dan endapan banyak.',
          created_by: 'admin-1',
        }),
        override_reason_tags: [
          'visual_missed_water',
          'visual_missed_sediment',
        ],
        override_primary_reason: 'visual_missed_water',
        override_feedback_severity: 'high',
      }),
      { new: true },
    );
  });

  it('keeps verification working without feedback fields', async () => {
    const { service, submissionModel } = createService();

    await service.verify(
      'sub-1',
      {
        actualWeight: 10,
        qualityGrade: 'B',
      },
      'admin-1',
    );

    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        quality_grade: 'B',
        quality_feedback: undefined,
        override_reason_tags: undefined,
        override_primary_reason: undefined,
        override_feedback_severity: undefined,
      }),
      { new: true },
    );
  });
});
