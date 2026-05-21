import { z } from 'zod';
import { Model } from 'mongoose';
import { WasteSubmissionEntity } from '../../database/schemas/submission.schema';
import type {
  AiVisualObservations,
  QualityGrade,
  WasteSubmission,
  WasteType,
} from '../../common/models';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let submissionModel: Model<WasteSubmissionEntity> | null = null;

export function setQualityAssessmentSubmissionModel(
  model: Model<WasteSubmissionEntity>,
) {
  submissionModel = model;
}

function formatPercent(value?: number): string {
  return value == null ? 'belum tersedia' : `${Math.round(value * 100)}%`;
}

function formatRupiah(value?: number): string {
  return value == null ? 'belum tersedia' : `Rp ${value.toLocaleString('id-ID')}`;
}

function getWasteTypeLabel(wasteType?: WasteType): string {
  if (wasteType === 'oil') return 'minyak jelantah';
  if (wasteType === 'food') return 'sisa makanan';
  return 'limbah';
}

function getConfidenceLabel(confidence?: number): string {
  if (confidence == null) return 'belum tersedia';
  if (confidence >= 0.8) return 'High Confidence';
  if (confidence >= 0.6) return 'Medium Confidence';
  if (confidence >= 0.4) return 'Low Confidence';
  return 'Needs Manual Review';
}

function boolLabel(value?: boolean): string {
  if (value == null) return 'Belum tersedia';
  return value ? 'Ya' : 'Tidak';
}

function formatList(items?: string[]): string {
  if (!items?.length) return '- Belum ada kriteria tersimpan';
  return items.map((item) => `- ${item}`).join('\n');
}

function formatOptional(value?: string | number): string {
  return value == null || value === '' ? 'belum tersedia' : String(value);
}

function getRagExplanation(source?: 'rag' | 'fallback_sop'): string {
  if (source === 'rag') {
    return 'SOP kualitas diambil dari Supabase RAG.';
  }

  if (source === 'fallback_sop') {
    return 'SOP dari Supabase RAG tidak tersedia atau tidak relevan, sehingga sistem memakai fallback SOP lokal.';
  }

  return 'Sumber SOP belum tercatat.';
}

function getConfidenceExplanation(
  submission: WasteSubmission,
  visual?: AiVisualObservations,
): string {
  const confidence = submission.ai_quality_confidence;
  const reasons: string[] = [];

  if (confidence == null) {
    reasons.push('Confidence belum tersedia di data setoran.');
  } else if (confidence >= 0.8) {
    reasons.push('Confidence tinggi karena bukti kualitas cukup kuat.');
  } else if (confidence >= 0.6) {
    reasons.push(
      'Confidence sedang karena bukti cukup mendukung, tetapi admin tetap perlu validasi.',
    );
  } else if (confidence >= 0.4) {
    reasons.push(
      'Confidence rendah karena data visual, deskripsi, atau SOP belum cukup kuat.',
    );
  } else {
    reasons.push('Confidence sangat rendah sehingga perlu review manual.');
  }

  if (
    visual?.imageQuality &&
    ['blurry', 'dark', 'unclear', 'invalid'].includes(visual.imageQuality)
  ) {
    reasons.push('Kualitas foto menurunkan confidence.');
  }

  if (visual?.isWasteVisible === false) {
    reasons.push('Limbah tidak terlihat jelas pada foto.');
  }

  if (
    visual?.detectedWasteType &&
    visual.detectedWasteType !== 'unknown' &&
    visual.detectedWasteType !== submission.waste_type
  ) {
    reasons.push('Jenis limbah terdeteksi tidak cocok dengan data submission.');
  }

  if (submission.ai_visual_source === 'fallback') {
    reasons.push('Analisis visual memakai fallback sehingga confidence lebih terbatas.');
  }

  if (submission.ai_quality_rag_source === 'fallback_sop') {
    reasons.push('Fallback SOP dapat mengurangi kepastian dibanding dokumen RAG yang relevan.');
  }

  return reasons.map((reason) => `- ${reason}`).join('\n');
}

function formatVisionSection(submission: WasteSubmission): string {
  const visual = submission.ai_visual_observations;

  if (!visual) {
    return [
      'OBSERVASI FOTO AI',
      '- Tidak ada observasi visual tersimpan untuk setoran ini.',
    ].join('\n');
  }

  const lines = [
    'OBSERVASI FOTO AI',
    `- Kualitas foto: ${visual.imageQuality}`,
    `- Limbah terlihat: ${boolLabel(visual.isWasteVisible)}`,
    `- Jenis limbah terdeteksi: ${visual.detectedWasteType}`,
    `- Warna: ${formatOptional(visual.color)}`,
    `- Kejernihan: ${formatOptional(visual.clarity)}`,
    `- Endapan: ${formatOptional(visual.sedimentLevel)}`,
    `- Air terlihat: ${boolLabel(visual.waterVisible)}`,
    `- Sisa makanan terlihat: ${boolLabel(visual.foodResidueVisible)}`,
    `- Kontaminasi non-organik: ${boolLabel(
      visual.nonOrganicContaminationVisible,
    )}`,
    `- Kondisi wadah: ${formatOptional(visual.containerCondition)}`,
    `- Vision confidence: ${formatPercent(visual.visionConfidence)}`,
    `- Vision source: ${formatOptional(submission.ai_visual_source)}`,
    `- Vision model: ${formatOptional(submission.ai_visual_model)}`,
    `- Catatan visual: ${visual.visualObservation}`,
  ];

  if (submission.ai_visual_source === 'fallback') {
    lines.push(
      '- Catatan visual: Analisis visual menggunakan fallback, sehingga AI tidak benar-benar berhasil membaca foto. Admin perlu melakukan review manual.',
    );
  }

  return lines.join('\n');
}

function formatAdminDecisionSection(submission: WasteSubmission): string {
  const lines = ['KEPUTUSAN FINAL ADMIN'];

  if (!submission.quality_grade) {
    lines.push(
      '- Grade final admin belum tersedia. Rekomendasi AI belum menjadi keputusan final.',
    );
  } else if (submission.quality_grade === submission.ai_quality_grade) {
    if (submission.quality_grade_source === 'ai') {
      lines.push('- Admin menggunakan rekomendasi AI sebagai grade final.');
    } else {
      lines.push('- Grade final admin sama dengan rekomendasi AI.');
    }
  } else {
    lines.push(
      `- AI merekomendasikan Grade ${submission.ai_quality_grade}, tetapi grade final admin adalah Grade ${submission.quality_grade}. Dynamic Pricing memakai grade final admin, bukan rekomendasi AI.`,
    );
  }

  if (submission.quality_grade_source === 'admin') {
    lines.push('- Admin memilih atau mengubah grade secara manual.');
  }

  if (submission.admin_quality_notes) {
    lines.push(`- Catatan admin: ${submission.admin_quality_notes}`);
  }

  lines.push('- Admin tetap menjadi validator akhir.');
  return lines.join('\n');
}

function formatPricingSection(submission: WasteSubmission): string {
  const lines = ['DAMPAK KE DYNAMIC PRICING'];

  if (submission.quality_grade) {
    lines.push(
      `- Dynamic Pricing menggunakan grade final admin, yaitu Grade ${submission.quality_grade}.`,
    );
  }

  if (
    submission.final_price_per_kg != null ||
    submission.earnings != null ||
    submission.price_snapshot_per_kg != null ||
    submission.actual_weight != null
  ) {
    lines.push(`- Berat aktual: ${formatOptional(submission.actual_weight)} kg`);
    lines.push(
      `- Harga dasar saat submit: ${formatRupiah(
        submission.price_snapshot_per_kg,
      )}/kg`,
    );
    lines.push(
      `- Harga final per kg: ${formatRupiah(submission.final_price_per_kg)}/kg`,
    );
    lines.push(`- Total cuan: ${formatRupiah(submission.earnings)}`);
    if (submission.pricing_explanation) {
      lines.push(`- Penjelasan pricing: ${submission.pricing_explanation}`);
    }
  } else {
    lines.push('- Detail pricing belum tersedia atau belum dihitung untuk setoran ini.');
  }

  lines.push(
    '- Rekomendasi AI tidak langsung menentukan payout. Payout dihitung setelah validasi admin.',
  );
  return lines.join('\n');
}

function buildExplanation(submission: WasteSubmission): string {
  const visual = submission.ai_visual_observations;

  return [
    'RINGKASAN AI QUALITY CHECK',
    `- Submission ID: ${submission.id}`,
    `- Jenis limbah: ${getWasteTypeLabel(submission.waste_type)}`,
    `- Status: ${submission.status}`,
    `- Rekomendasi grade AI: Grade ${submission.ai_quality_grade}`,
    `- Grade final admin: ${submission.quality_grade ?? 'belum tersedia'}`,
    `- Confidence: ${formatPercent(submission.ai_quality_confidence)} (${getConfidenceLabel(
      submission.ai_quality_confidence,
    )})`,
    '',
    'ALASAN REKOMENDASI AI',
    `- Alasan: ${submission.ai_quality_reason ?? 'Belum ada alasan tersimpan.'}`,
    `- Tingkat kontaminasi: ${
      submission.ai_contamination_level ?? 'belum tersedia'
    }`,
    '- Kriteria cocok:',
    formatList(submission.ai_quality_matched_criteria),
    `- Tips: ${submission.ai_quality_tips ?? 'Belum ada tips tersimpan.'}`,
    '',
    formatVisionSection(submission),
    '',
    'SUMBER SOP / RAG',
    `- ${getRagExplanation(submission.ai_quality_rag_source)}`,
    '',
    'PENJELASAN CONFIDENCE',
    `- Confidence: ${formatPercent(submission.ai_quality_confidence)} (${getConfidenceLabel(
      submission.ai_quality_confidence,
    )})`,
    getConfidenceExplanation(submission, visual),
    '',
    formatAdminDecisionSection(submission),
    '',
    formatPricingSection(submission),
    '',
    'CATATAN KEAMANAN',
    'AI hanya memberi rekomendasi. Admin tetap menentukan grade final. Sistem tidak boleh mengubah wallet atau transaksi langsung dari hasil AI.',
  ].join('\n');
}

const explainQualityAssessmentTool: AgentTool = {
  name: 'explain_quality_assessment',
  description:
    'Explain AI quality assessment, vision observation, confidence score, Supabase RAG or fallback SOP, admin override, and pricing impact for a waste submission. Use this when the user asks why grade A/B/C, why confidence is low, what AI saw from the photo, how AI quality affects pricing, or whether final price used AI recommendation or admin grade.',
  parameters: z.object({
    submission_id: z.string().optional(),
  }),
  execute: async (
    args: { submission_id?: string },
    context?: ToolContext,
  ) => {
    if (!context?.isAuthenticated) {
      return 'Silakan login terlebih dahulu untuk melihat penjelasan AI Quality Check.';
    }

    if (!submissionModel) return 'Submission service is not available.';

    const isAdmin = context.role === 'admin';
    const query = args.submission_id
      ? isAdmin
        ? { id: args.submission_id }
        : { id: args.submission_id, user_id: context.userId }
      : isAdmin
        ? { ai_quality_grade: { $exists: true } }
        : {
            user_id: context.userId,
            ai_quality_grade: { $exists: true },
          };

    const submissionQuery = submissionModel.findOne(query);
    submissionQuery.sort({ ai_quality_checked_at: -1, created_at: -1 });
    const submission = await submissionQuery.lean().exec();

    if (!submission) {
      return args.submission_id
        ? `Setoran dengan ID "${args.submission_id}" tidak ditemukan atau Anda tidak memiliki akses ke setoran tersebut.`
        : 'Belum ada setoran dengan hasil AI Quality Check yang bisa dijelaskan.';
    }

    if (!submission.ai_quality_grade) {
      return 'AI Quality Check belum dijalankan untuk setoran ini. Admin perlu menjalankan analisis kualitas terlebih dahulu.';
    }

    return buildExplanation(submission);
  },
};

globalToolRegistry.registerTool(explainQualityAssessmentTool);
