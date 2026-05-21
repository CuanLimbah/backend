import { globalToolRegistry } from './tool.registry';
import { setPricingSubmissionModel } from './explain-submission-pricing.tool';
import './explain-submission-pricing.tool';

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

describe('explain_submission_pricing tool', () => {
  const tool = globalToolRegistry.getTool('explain_submission_pricing');

  it('asks unauthenticated users to log in', async () => {
    const model = createModel(null);
    setPricingSubmissionModel(model as any);

    const result = await tool?.execute(
      {},
      { userId: 'user-1', isAuthenticated: false },
    );

    expect(result).toBe(
      'Silakan login terlebih dahulu untuk melihat penjelasan harga setoran Anda.',
    );
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('explains completed submissions with pricing fields', async () => {
    const model = createModel({
      id: 'sub-1',
      user_id: 'user-1',
      waste_type: 'oil',
      estimated_weight: 10,
      actual_weight: 10,
      status: 'completed',
      created_at: new Date().toISOString(),
      quality_grade: 'B',
      price_snapshot_per_kg: 3000,
      final_price_per_kg: 2550,
      earnings: 25500,
      pricing_explanation:
        'Cuan final untuk 10 kg minyak jelantah grade B adalah Rp 25.500.',
    });
    setPricingSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-1' },
      { userId: 'user-1', isAuthenticated: true },
    );

    expect(model.findOne).toHaveBeenCalledWith({
      id: 'sub-1',
      user_id: 'user-1',
    });
    expect(result).toContain('Grade kualitas: B.');
    expect(result).toContain('Harga dasar saat submit: Rp 3.000/kg.');
    expect(result).toContain('Harga final / kg: Rp 2.550/kg.');
    expect(result).toContain('Total Cuan: Rp 25.500.');
  });

  it('falls back for completed old submissions without pricing fields', async () => {
    const model = createModel({
      id: 'sub-old',
      user_id: 'user-1',
      waste_type: 'food',
      estimated_weight: 5,
      actual_weight: 4.5,
      status: 'completed',
      created_at: new Date().toISOString(),
      earnings: 4500,
    });
    setPricingSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-old' },
      { userId: 'user-1', isAuthenticated: true },
    );

    expect(result).toBe(
      'Setoran ini belum memiliki breakdown dynamic pricing lengkap, tetapi total Cuan tercatat sebesar Rp 4.500 dengan berat aktual 4.5 kg.',
    );
  });

  it('does not explain pending submissions', async () => {
    const model = createModel({
      id: 'sub-pending',
      user_id: 'user-1',
      waste_type: 'oil',
      estimated_weight: 5,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    setPricingSubmissionModel(model as any);

    const result = await tool?.execute(
      { submission_id: 'sub-pending' },
      { userId: 'user-1', isAuthenticated: true },
    );

    expect(result).toBe(
      'Harga final belum tersedia karena setoran masih menunggu verifikasi.',
    );
  });
});
