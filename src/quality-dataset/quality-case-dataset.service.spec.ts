import { QualityCaseDatasetService } from './quality-case-dataset.service';

function execQuery<T>(value: T) {
  return {
    exec: jest.fn().mockResolvedValue(value),
  };
}

function findQuery<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

const eligibleSubmission = {
  id: 'sub-1',
  user_id: 'user-1',
  waste_type: 'oil',
  image_url: 'https://example.com/oil.jpg',
  estimated_weight: 10,
  actual_weight: 10,
  status: 'completed',
  created_at: '2026-05-20T00:00:00.000Z',
  ai_quality_grade: 'B',
  ai_quality_confidence: 0.78,
  ai_contamination_level: 'low',
  ai_quality_reason: 'Minyak agak keruh.',
  ai_quality_rag_source: 'rag',
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
  price_snapshot_per_kg: 3000,
  final_price_per_kg: 2550,
  earnings: 25500,
};

describe('QualityCaseDatasetService', () => {
  function createService(options?: {
    cases?: Array<Record<string, unknown>>;
    submissions?: Array<Record<string, unknown>>;
    caseBySubmission?: Record<string, unknown> | null;
    embeddingResult?: Record<string, unknown> | null;
  }) {
    const findOneAndUpdateQuery = execQuery({});
    const datasetModel = {
      findOneAndUpdate: jest.fn().mockReturnValue(findOneAndUpdateQuery),
      find: jest.fn().mockReturnValue(findQuery(options?.cases ?? [])),
      findOne: jest
        .fn()
        .mockReturnValue(findQuery(options?.caseBySubmission ?? null)),
    };
    const submissionModel = {
      find: jest.fn().mockReturnValue(findQuery(options?.submissions ?? [])),
    };
    const imageEmbeddingService = {
      generateForQualityCase: jest
        .fn()
        .mockResolvedValue(options?.embeddingResult ?? null),
    };

    return {
      service: new QualityCaseDatasetService(
        datasetModel as any,
        submissionModel as any,
        imageEmbeddingService as any,
      ),
      datasetModel,
      submissionModel,
      imageEmbeddingService,
      findOneAndUpdateQuery,
    };
  }

  it('upserts eligible case when all required data exists', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission(eligibleSubmission as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          submission_id: 'sub-1',
          image_url: 'https://example.com/oil.jpg',
          final_quality_grade: 'B',
          eligibility_status: 'eligible',
          eligibility_reasons: [],
          is_overridden: false,
        }),
        $setOnInsert: expect.objectContaining({
          id: expect.stringMatching(/^qcd-/),
        }),
      }),
      { upsert: true, new: true },
    );
  });

  it('marks missing image as missing_image', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission({
      ...eligibleSubmission,
      image_url: undefined,
    } as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          eligibility_status: 'missing_image',
          eligibility_reasons: ['missing_image'],
        }),
      }),
      expect.anything(),
    );
  });

  it('marks missing final grade as missing_final_grade', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission({
      ...eligibleSubmission,
      quality_grade: undefined,
    } as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          eligibility_status: 'missing_final_grade',
          eligibility_reasons: ['missing_final_grade'],
        }),
      }),
      expect.anything(),
    );
  });

  it('marks missing visual observation as missing_visual_observation', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission({
      ...eligibleSubmission,
      ai_visual_observations: undefined,
    } as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          eligibility_status: 'missing_visual_observation',
          eligibility_reasons: ['missing_visual_observation'],
        }),
      }),
      expect.anything(),
    );
  });

  it('marks missing admin validation as missing_admin_validation', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission({
      ...eligibleSubmission,
      status: 'pending',
    } as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          eligibility_status: 'missing_admin_validation',
          eligibility_reasons: ['missing_admin_validation'],
        }),
      }),
      expect.anything(),
    );
  });

  it('sets is_overridden when AI grade differs from final grade', async () => {
    const { service, datasetModel } = createService();

    await service.upsertFromSubmission({
      ...eligibleSubmission,
      ai_quality_grade: 'A',
      quality_grade: 'C',
    } as any);

    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          is_overridden: true,
          ai_error_pattern: 'ai_too_optimistic',
        }),
      }),
      expect.anything(),
    );
  });

  it('backfills completed and verified submissions', async () => {
    const { service, submissionModel, datasetModel } = createService({
      submissions: [eligibleSubmission, { ...eligibleSubmission, id: 'sub-2' }],
    });

    const result = await service.backfillFromCompletedSubmissions();

    expect(submissionModel.find).toHaveBeenCalledWith({
      status: { $in: ['completed', 'verified'] },
    });
    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scanned: 2, upserted: 2, failed: 0 });
  });

  it('calculates readiness analytics', async () => {
    const { service } = createService({
      cases: [
        {
          ...eligibleSubmission,
          submission_id: 'sub-1',
          final_quality_grade: 'B',
          eligibility_status: 'eligible',
          eligibility_reasons: [],
          ai_visual_source: 'vision_llm',
          ai_quality_rag_source: 'rag',
          override_reason_tags: ['admin_manual_inspection'],
          ai_error_pattern: 'ai_too_optimistic',
        },
        {
          ...eligibleSubmission,
          submission_id: 'sub-2',
          waste_type: 'food',
          final_quality_grade: 'C',
          eligibility_status: 'missing_image',
          eligibility_reasons: [
            'missing_image',
            'missing_visual_observation',
          ],
          ai_visual_source: 'fallback',
          ai_quality_rag_source: 'fallback_sop',
          override_reason_tags: ['photo_unclear'],
          ai_error_pattern: 'vision_fallback_used',
        },
      ],
    });

    const analytics = await service.getReadinessAnalytics();

    expect(analytics.totalCases).toBe(2);
    expect(analytics.eligibleCases).toBe(1);
    expect(analytics.ineligibleCases).toBe(1);
    expect(analytics.eligibilityRate).toBe(0.5);
    expect(analytics.missingImageCount).toBe(1);
    expect(analytics.missingVisualObservationCount).toBe(1);
    expect(analytics.byWasteType.oil.eligibleCases).toBe(1);
    expect(analytics.byWasteType.food.eligibilityRate).toBe(0);
    expect(analytics.byFinalGrade).toEqual({ A: 0, B: 1, C: 1 });
    expect(analytics.visionSourceUsage).toEqual({
      vision_llm: 1,
      fallback: 1,
    });
    expect(analytics.ragSourceUsage).toEqual({
      rag: 1,
      fallback_sop: 1,
    });
    expect(analytics.feedbackTagCounts).toEqual({
      admin_manual_inspection: 1,
      photo_unclear: 1,
    });
    expect(analytics.aiErrorPatterns).toEqual({
      ai_too_optimistic: 1,
      vision_fallback_used: 1,
    });
    expect(analytics.embeddingCoverage).toEqual({
      totalEligibleCases: 1,
      embeddedCases: 0,
      missingEmbeddingCases: 1,
      embeddingCoverageRate: 0,
    });
    expect(analytics.recentEligibleCases).toHaveLength(1);
  });

  it('lists cases with filters and bounded limit', async () => {
    const { service, datasetModel } = createService();

    await service.listCases({
      eligibilityStatus: 'eligible',
      wasteType: 'oil',
      finalGrade: 'B',
      limit: 500,
    });

    expect(datasetModel.find).toHaveBeenCalledWith({
      eligibility_status: 'eligible',
      waste_type: 'oil',
      final_quality_grade: 'B',
    });
  });

  it('marks ineligible case embedding as skipped', async () => {
    const { service, datasetModel } = createService({
      caseBySubmission: {
        ...eligibleSubmission,
        submission_id: 'sub-1',
        eligibility_status: 'missing_image',
      },
    });

    const result = await service.generateEmbeddingForCase('sub-1');

    expect(result).toEqual({
      submissionId: 'sub-1',
      status: 'skipped',
      reason: 'Case is not eligible for embedding',
    });
    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          image_embedding_status: 'skipped',
          similarity_search_ready: false,
        }),
      }),
    );
  });

  it('stores embedding metadata for eligible case', async () => {
    const { service, datasetModel, imageEmbeddingService } = createService({
      caseBySubmission: {
        ...eligibleSubmission,
        submission_id: 'sub-1',
        eligibility_status: 'eligible',
      },
      embeddingResult: {
        embedding: [1, 0, 0],
        model: 'test-embedding-model',
        source: 'visual_text_embedding',
      },
    });

    const result = await service.generateEmbeddingForCase('sub-1');

    expect(imageEmbeddingService.generateForQualityCase).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: eligibleSubmission.image_url,
        wasteType: 'oil',
      }),
    );
    expect(result).toEqual({ submissionId: 'sub-1', status: 'ready' });
    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          image_embedding: [1, 0, 0],
          image_embedding_model: 'test-embedding-model',
          image_embedding_source: 'visual_text_embedding',
          image_embedding_status: 'ready',
          similarity_search_ready: true,
        }),
      }),
    );
  });

  it('marks embedding generation as failed when provider returns null', async () => {
    const { service, datasetModel } = createService({
      caseBySubmission: {
        ...eligibleSubmission,
        submission_id: 'sub-1',
        eligibility_status: 'eligible',
      },
      embeddingResult: null,
    });

    const result = await service.generateEmbeddingForCase('sub-1');

    expect(result.status).toBe('failed');
    expect(datasetModel.findOneAndUpdate).toHaveBeenCalledWith(
      { submission_id: 'sub-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          image_embedding_status: 'failed',
          similarity_search_ready: false,
        }),
      }),
    );
  });

  it('backfills embeddings for eligible cases with a bounded limit', async () => {
    const { service, datasetModel } = createService({
      cases: [
        { ...eligibleSubmission, submission_id: 'sub-1' },
        { ...eligibleSubmission, submission_id: 'sub-2' },
      ],
      caseBySubmission: {
        ...eligibleSubmission,
        submission_id: 'sub-1',
        eligibility_status: 'eligible',
      },
      embeddingResult: {
        embedding: [1, 0, 0],
        model: 'test',
        source: 'visual_text_embedding',
      },
    });

    const result = await service.backfillEmbeddingsForEligibleCases({
      limit: 1,
    });

    expect(datasetModel.find).toHaveBeenCalledWith({
      eligibility_status: 'eligible',
      image_embedding_status: { $ne: 'ready' },
    });
    expect(result.scanned).toBe(2);
    expect(result.embedded).toBe(2);
  });

  it('backfill force omits ready embedding filter', async () => {
    const { service, datasetModel } = createService({ cases: [] });

    await service.backfillEmbeddingsForEligibleCases({ force: true });

    expect(datasetModel.find).toHaveBeenCalledWith({
      eligibility_status: 'eligible',
    });
  });

  it('finds similar cases by waste type, excludes current submission, and applies min similarity', async () => {
    const { service, datasetModel } = createService({
      cases: [
        {
          ...eligibleSubmission,
          submission_id: 'sub-a',
          waste_type: 'oil',
          image_embedding: [1, 0],
          final_quality_grade: 'B',
          eligibility_status: 'eligible',
        },
        {
          ...eligibleSubmission,
          submission_id: 'sub-b',
          waste_type: 'oil',
          image_embedding: [0, 1],
          final_quality_grade: 'C',
          eligibility_status: 'eligible',
        },
      ],
    });

    const result = await service.findSimilarCases({
      wasteType: 'oil',
      embedding: [1, 0],
      excludeSubmissionId: 'sub-current',
      minSimilarity: 0.7,
      limit: 5,
    });

    expect(datasetModel.find).toHaveBeenCalledWith({
      eligibility_status: 'eligible',
      similarity_search_ready: true,
      image_embedding_status: 'ready',
      waste_type: 'oil',
      submission_id: { $ne: 'sub-current' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        submission_id: 'sub-a',
        similarity: 1,
      }),
    );
  });
});
