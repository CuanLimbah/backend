import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QualityAssessmentService } from './quality-assessment.service';

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('QualityAssessmentService', () => {
  function createService(overrides?: {
    submission?: Record<string, unknown> | null;
    ragSource?: 'rag' | 'fallback_sop';
    visualObservation?: Record<string, unknown>;
  }) {
    const submission =
      overrides?.submission === null
        ? null
        : {
            id: 'sub-1',
            user_id: 'user-1',
            waste_type: 'oil',
            estimated_weight: 10,
            image_url: 'https://example.com/oil.jpg',
            status: 'pending',
            created_at: new Date().toISOString(),
            ...overrides?.submission,
          };
    const updated = {
      ...submission,
      ai_quality_grade: 'B',
    };
    const submissionModel = {
      findOne: jest.fn().mockReturnValue(queryResult(submission)),
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      }),
    };
    const qualityRagService = {
      getQualityCriteria: jest.fn().mockResolvedValue({
        source: overrides?.ragSource ?? 'fallback_sop',
        criteriaText:
          'Grade B: Agak keruh; ada sedikit endapan; tidak dominan bercampur air.',
        criteria: [
          'Grade B: Agak keruh; ada sedikit endapan; tidak dominan bercampur air.',
        ],
      }),
    };
    const visualObservation = {
      imageQuality: 'clear',
      isWasteVisible: true,
      detectedWasteType: 'oil',
      sedimentLevel: 'low',
      visualObservation:
        'Minyak terlihat agak keruh dengan sedikit endapan di bagian bawah.',
      visionConfidence: 0.78,
      ...overrides?.visualObservation,
    };
    const qualityVisionService = {
      analyzeWasteImage: jest.fn().mockResolvedValue(visualObservation),
      getModelVersion: jest.fn().mockReturnValue('openai:vision-quality-mvp-v1'),
      getSourceForObservation: jest.fn().mockReturnValue('vision_llm'),
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const service = new QualityAssessmentService(
      submissionModel as any,
      qualityRagService as any,
      qualityVisionService as any,
      config as any,
    );

    return {
      service,
      submissionModel,
      qualityRagService,
      qualityVisionService,
    };
  }

  it('runs quality check with valid submission and description', async () => {
    const { service } = createService();

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription:
        'Minyak agak keruh, ada sedikit endapan, tidak terlihat bercampur air.',
    });

    expect(result.submissionId).toBe('sub-1');
    expect(result.recommendedGrade).toBe('B');
    expect(result.requiresAdminReview).toBe(true);
    expect(result.ragSource).toBe('fallback_sop');
  });

  it('returns 404 when submission is not found', async () => {
    const { service } = createService({ submission: null });

    await expect(
      service.analyzeSubmissionQuality({
        submissionId: 'missing-submission',
        requestedBy: 'admin-1',
        conditionDescription: 'Minyak agak keruh.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses Supabase RAG result source when retrieval is available', async () => {
    const { service } = createService({ ragSource: 'rag' });

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription:
        'Minyak agak keruh, ada sedikit endapan, tidak terlihat bercampur air.',
    });

    expect(result.ragSource).toBe('rag');
  });

  it('falls back to local SOP when RAG service returns fallback source', async () => {
    const { service } = createService({ ragSource: 'fallback_sop' });

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Kondisi agak keruh.',
    });

    expect(result.ragSource).toBe('fallback_sop');
    expect(result.modelProvider).toBe('deterministic');
  });

  it('rejects quality check without description and without image_url', async () => {
    const { service } = createService({
      submission: {
        image_url: undefined,
      },
    });

    await expect(
      service.analyzeSubmissionQuality({
        submissionId: 'sub-1',
        requestedBy: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves AI fields on the submission', async () => {
    const { service, submissionModel } = createService({ ragSource: 'rag' });

    await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Minyak sangat keruh dan banyak endapan.',
    });

    expect(submissionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'sub-1' },
      expect.objectContaining({
        ai_quality_grade: 'C',
        ai_quality_confidence: expect.any(Number),
        ai_contamination_level: 'high',
        ai_quality_source: 'rag',
        ai_quality_rag_source: 'rag',
        ai_visual_observations: expect.objectContaining({
          imageQuality: 'clear',
          detectedWasteType: 'oil',
        }),
        ai_visual_checked_at: expect.any(String),
        ai_visual_model: 'openai:vision-quality-mvp-v1',
        ai_visual_source: 'vision_llm',
      }),
      { new: true },
    );
  });

  it('calls QualityVisionService when image_url exists', async () => {
    const { service, qualityVisionService } = createService();

    await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Minyak agak keruh.',
    });

    expect(qualityVisionService.analyzeWasteImage).toHaveBeenCalledWith({
      imageUrl: 'https://example.com/oil.jpg',
      expectedWasteType: 'oil',
    });
  });

  it('allows quality check with image_url when conditionDescription is omitted', async () => {
    const { service } = createService();

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
    });

    expect(result.submissionId).toBe('sub-1');
    expect(result.visualObservation).toBeDefined();
  });

  it('uses low confidence when condition description is vague', async () => {
    const { service } = createService({
      submission: {
        image_url: undefined,
      },
    });

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Keruh',
    });

    expect(result.confidence).toBeLessThanOrEqual(0.55);
    expect(result.requiresAdminReview).toBe(true);
  });

  it('caps confidence when visual observation is unclear', async () => {
    const { service } = createService({
      visualObservation: {
        imageQuality: 'unclear',
        isWasteVisible: true,
        detectedWasteType: 'oil',
        visualObservation: 'Foto kurang jelas, detail limbah sulit dinilai.',
        visionConfidence: 0.35,
      },
    });

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Minyak agak keruh dengan sedikit endapan.',
    });

    expect(result.confidence).toBeLessThanOrEqual(0.55);
  });

  it('caps confidence when detected waste type mismatches submission waste type', async () => {
    const { service } = createService({
      visualObservation: {
        imageQuality: 'clear',
        isWasteVisible: true,
        detectedWasteType: 'food',
        visualObservation: 'Foto terlihat seperti sisa makanan, bukan minyak.',
        visionConfidence: 0.82,
      },
    });

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Minyak agak keruh dengan sedikit endapan.',
    });

    expect(result.confidence).toBeLessThanOrEqual(0.45);
  });

  it('recommends grade C when description mentions many sediments or mixed water', async () => {
    const { service } = createService();

    const result = await service.analyzeSubmissionQuality({
      submissionId: 'sub-1',
      requestedBy: 'admin-1',
      conditionDescription: 'Minyak terlihat bercampur air dan banyak endapan.',
    });

    expect(result.recommendedGrade).toBe('C');
    expect(result.contaminationLevel).toBe('high');
  });
});
