import { globalToolRegistry } from './tool.registry';
import { setQualityAssessmentSubmissionModel } from './explain-quality-assessment.tool';
import './explain-quality-assessment.tool';

function createModel(submission: Record<string, unknown> | null) {
  const query = {
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(submission),
  };

  return {
    findOne: jest.fn().mockReturnValue(query),
    query,
  };
}

const baseSubmission = {
  id: 'sub-1',
  user_id: 'user-1',
  waste_type: 'oil',
  estimated_weight: 10,
  actual_weight: 10,
  status: 'completed',
  created_at: '2026-05-20T00:00:00.000Z',
  ai_quality_grade: 'B',
  ai_quality_confidence: 0.78,
  ai_contamination_level: 'low',
  ai_quality_reason: 'Minyak agak keruh dengan sedikit endapan.',
  ai_quality_tips: 'Saring minyak sebelum disetor.',
  ai_quality_matched_criteria: ['Grade B: agak keruh dan sedikit endapan.'],
  ai_quality_checked_at: '2026-05-20T01:00:00.000Z',
  ai_quality_rag_source: 'rag',
  ai_visual_observations: {
    imageQuality: 'clear',
    isWasteVisible: true,
    detectedWasteType: 'oil',
    color: 'coklat gelap',
    clarity: 'agak keruh',
    sedimentLevel: 'low',
    waterVisible: false,
    foodResidueVisible: true,
    nonOrganicContaminationVisible: false,
    containerCondition: 'botol tertutup',
    visualObservation:
      'Minyak terlihat agak keruh dengan sedikit endapan.',
    visionConfidence: 0.78,
  },
  ai_visual_source: 'vision_llm',
  ai_visual_model: 'gemini:vision-quality-mvp-v1',
  quality_grade: 'B',
  quality_grade_source: 'ai',
  price_snapshot_per_kg: 3000,
  final_price_per_kg: 2550,
  earnings: 25500,
  pricing_explanation:
    'Cuan final memakai grade B dan harga final Rp 2.550/liter.',
};

describe('explain_quality_assessment tool', () => {
  const tool = globalToolRegistry.getTool('explain_quality_assessment');

  it('asks unauthenticated users to log in', async () => {
    const model = createModel(null);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      {},
      { userId: 'user-1', isAuthenticated: false },
    );

    expect(result).toBe(
      'Silakan login terlebih dahulu untuk melihat penjelasan AI Quality Check.',
    );
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('lets a normal user explain their own submission', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(model.findOne).toHaveBeenCalledWith({
      id: 'sub-1',
      user_id: 'user-1',
    });
    expect(result).toContain('RINGKASAN AI QUALITY CHECK');
    expect(result).toContain('Rekomendasi grade AI: Grade B');
  });

  it('does not let a normal user explain another user submission', async () => {
    const model = createModel(null);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-2' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(model.findOne).toHaveBeenCalledWith({
      id: 'sub-2',
      user_id: 'user-1',
    });
    expect(result).toBe(
      'Setoran dengan ID "sub-2" tidak ditemukan atau Anda tidak memiliki akses ke setoran tersebut.',
    );
  });

  it('lets admin explain any submission by submission_id', async () => {
    const model = createModel({ ...baseSubmission, user_id: 'user-2' });
    setQualityAssessmentSubmissionModel(model as any);

    await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(model.findOne).toHaveBeenCalledWith({ id: 'sub-1' });
  });

  it('without submission_id normal user gets latest own AI quality submission', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    await tool?.execute(
      {},
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(model.findOne).toHaveBeenCalledWith({
      user_id: 'user-1',
      ai_quality_grade: { $exists: true },
    });
    expect(model.query.sort).toHaveBeenCalledWith({
      ai_quality_checked_at: -1,
      created_at: -1,
    });
  });

  it('without submission_id admin gets latest AI quality submission', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    await tool?.execute(
      {},
      { userId: 'admin-1', isAuthenticated: true, role: 'admin' },
    );

    expect(model.findOne).toHaveBeenCalledWith({
      ai_quality_grade: { $exists: true },
    });
  });

  it('returns not-run message for submission without ai_quality_grade', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_quality_grade: undefined,
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toBe(
      'AI Quality Check belum dijalankan untuk setoran ini. Admin perlu menjalankan analisis kualitas terlebih dahulu.',
    );
  });

  it('includes visual observation fields when stored', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('OBSERVASI FOTO AI');
    expect(result).toContain('Kualitas foto: clear');
    expect(result).toContain('Vision confidence: 78%');
    expect(result).toContain('Vision model: gemini:vision-quality-mvp-v1');
  });

  it('mentions fallback vision clearly', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_visual_source: 'fallback',
      ai_visual_model: 'fallback:vision-quality-mvp-v1',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('Analisis visual menggunakan fallback');
  });

  it('mentions Supabase RAG source', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('SOP kualitas diambil dari Supabase RAG.');
  });

  it('mentions fallback SOP source', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_quality_rag_source: 'fallback_sop',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('sistem memakai fallback SOP lokal');
  });

  it('mentions admin override when final grade differs from AI grade', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_quality_grade: 'B',
      quality_grade: 'A',
      quality_grade_source: 'admin',
      admin_quality_notes: 'Foto lebih bersih saat inspeksi manual.',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain(
      'AI merekomendasikan Grade B, tetapi grade final admin adalah Grade A',
    );
    expect(result).toContain('Admin memilih atau mengubah grade secara manual.');
    expect(result).toContain('Catatan admin: Foto lebih bersih');
  });

  it('mentions pricing uses final admin grade, not AI grade', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_quality_grade: 'B',
      quality_grade: 'A',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain(
      'Dynamic Pricing memakai grade final admin, bukan rekomendasi AI.',
    );
    expect(result).toContain(
      'Dynamic Pricing menggunakan grade final admin, yaitu Grade A.',
    );
  });

  it('does not invent pricing when pricing fields are missing', async () => {
    const model = createModel({
      ...baseSubmission,
      actual_weight: undefined,
      price_snapshot_per_kg: undefined,
      final_price_per_kg: undefined,
      earnings: undefined,
      pricing_explanation: undefined,
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain(
      'Detail pricing belum tersedia atau belum dihitung untuk setoran ini.',
    );
  });

  it('includes pricing fields when available', async () => {
    const model = createModel(baseSubmission);
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('Volume aktual: 10 Liter');
    expect(result).toContain('Harga dasar saat submit: Rp 3.000/liter');
    expect(result).toContain('Harga final per liter: Rp 2.550/liter');
    expect(result).toContain('Total cuan: Rp 25.500');
  });

  it('mentions historical similar cases when multimodal RAG was used', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_multimodal_rag_used: true,
      ai_multimodal_rag_source: 'similar_quality_cases',
      ai_multimodal_rag_provider: 'supabase_pgvector',
      ai_similar_case_ids: ['sub-old-1', 'sub-old-2'],
      ai_similar_case_count: 2,
      ai_similar_case_top_score: 0.86,
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('REFERENSI KASUS HISTORIS MIRIP');
    expect(result).toContain(
      'AI juga membandingkan setoran ini dengan kasus historis yang mirip',
    );
    expect(result).toContain('Jumlah kasus mirip: 2');
    expect(result).toContain('Top similarity score: 86%');
    expect(result).toContain('sub-old-1, sub-old-2');
    expect(result).toContain(
      'Kasus historis mirip diambil melalui Supabase pgvector.',
    );
  });

  it('mentions application cosine fallback provider', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_multimodal_rag_used: true,
      ai_multimodal_rag_source: 'similar_quality_cases',
      ai_multimodal_rag_provider: 'application_cosine',
      ai_similar_case_ids: ['sub-old-1'],
      ai_similar_case_count: 1,
      ai_similar_case_top_score: 0.8,
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain(
      'Kasus historis mirip diambil melalui fallback application-level cosine similarity.',
    );
  });

  it('explains embedding unavailable for multimodal RAG', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_multimodal_rag_used: false,
      ai_multimodal_rag_source: 'embedding_unavailable',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain(
      'Multimodal RAG belum digunakan karena embedding visual-text belum tersedia.',
    );
  });

  it('explains when no similar cases were found', async () => {
    const model = createModel({
      ...baseSubmission,
      ai_multimodal_rag_used: false,
      ai_multimodal_rag_source: 'none',
    });
    setQualityAssessmentSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true, role: 'user' },
    );

    expect(result).toContain('Tidak ditemukan kasus historis yang cukup mirip.');
    expect(result).toContain(
      'Kasus historis hanya menjadi referensi tambahan. Grade final tetap ditentukan admin.',
    );
  });
});
