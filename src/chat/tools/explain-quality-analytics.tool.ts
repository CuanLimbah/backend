import { z } from 'zod';
import type {
  QualityAiAnalytics,
  QualityGrade,
  WasteType,
} from '../../common/models';
import { QualityAuditLogService } from '../../quality-audit/quality-audit-log.service';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let qualityAuditLogService: QualityAuditLogService | null = null;

export function setQualityAuditLogService(service: QualityAuditLogService) {
  qualityAuditLogService = service;
}

function formatPercent(value?: number | null): string {
  return value == null ? 'belum tersedia' : `${Math.round(value * 100)}%`;
}

function formatNumber(value?: number | null): string {
  return (value ?? 0).toLocaleString('id-ID');
}

function getWasteTypeLabel(type?: WasteType): string {
  if (type === 'oil') return 'Minyak Jelantah';
  if (type === 'food') return 'Sisa Makanan';
  return 'Tidak diketahui';
}

function formatGradeCount(distribution: Record<QualityGrade, number>): string {
  return [
    `- Grade A: ${formatNumber(distribution.A)}`,
    `- Grade B: ${formatNumber(distribution.B)}`,
    `- Grade C: ${formatNumber(distribution.C)}`,
  ].join('\n');
}

function formatOverrideMatrix(matrix: Record<string, number>): string {
  const rows = Object.entries(matrix)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) {
    return 'Belum ada pola override grade yang terlihat.';
  }

  return rows
    .map(
      ([transition, count]) =>
        `- ${transition}: ${formatNumber(count)} kasus (${describeOverrideTransition(
          transition,
        )})`,
    )
    .join('\n');
}

function describeOverrideTransition(transition: string): string {
  const [from, to] = transition.split('->');
  if (!from || !to) return 'pola override tercatat';
  return from < to
    ? 'admin sering menaikkan grade dari rekomendasi AI'
    : 'admin sering menurunkan grade dari rekomendasi AI';
}

function getAgreementInterpretation(agreementRate: number): string {
  if (agreementRate >= 0.8) {
    return 'AI cukup konsisten dengan keputusan admin.';
  }
  if (agreementRate >= 0.6) {
    return 'AI cukup membantu, tetapi masih perlu review admin.';
  }
  return 'Rekomendasi AI masih sering berbeda dari keputusan admin dan perlu evaluasi.';
}

function getOverrideInterpretation(overrideRate: number): string {
  if (overrideRate >= 0.3) {
    return 'Override admin relatif tinggi, sehingga pola override perlu ditinjau.';
  }
  if (overrideRate < 0.1) {
    return 'Override admin rendah, indikasi awal bahwa rekomendasi AI cukup selaras.';
  }
  return 'Override admin berada di tingkat sedang dan tetap perlu dipantau.';
}

function getConfidenceInterpretation(averageConfidence: number | null): string {
  if (averageConfidence == null) {
    return 'Confidence rata-rata belum tersedia.';
  }
  if (averageConfidence >= 0.8) {
    return 'Confidence rata-rata tinggi.';
  }
  if (averageConfidence >= 0.6) {
    return 'Confidence rata-rata sedang.';
  }
  return 'Confidence rata-rata rendah, perlu evaluasi kualitas foto, SOP, atau prompt assessment.';
}

function getRagUsageInterpretation(
  ragUsage: QualityAiAnalytics['ragUsage'],
): string {
  if (ragUsage.fallback_sop > ragUsage.rag) {
    return 'Fallback SOP lebih sering dipakai daripada Supabase RAG. Periksa dokumen SOP di Supabase RAG atau konfigurasi retrieval.';
  }
  if (ragUsage.rag > 0) {
    return 'Supabase RAG sudah digunakan dalam sebagian atau seluruh AI Quality Check.';
  }
  return 'Belum ada penggunaan Supabase RAG yang tercatat.';
}

function getVisionUsageInterpretation(
  visionUsage: QualityAiAnalytics['visionUsage'],
): string {
  if (visionUsage.fallback > visionUsage.vision_llm) {
    return 'Vision fallback cukup sering terjadi. Periksa konfigurasi provider vision/API key atau kualitas foto upload.';
  }
  if (visionUsage.vision_llm > 0) {
    return 'Vision LLM sudah berhasil digunakan dalam sebagian atau seluruh AI Quality Check.';
  }
  return 'Belum ada penggunaan Vision LLM yang tercatat.';
}

function getFilterDescription(input: {
  startDate?: string;
  endDate?: string;
  wasteType?: WasteType;
}): string {
  const parts: string[] = [];

  if (input.wasteType) {
    parts.push(`wasteType = ${getWasteTypeLabel(input.wasteType)}`);
  }
  if (input.startDate || input.endDate) {
    parts.push(
      `periode ${input.startDate ?? 'awal'} sampai ${input.endDate ?? 'akhir'}`,
    );
  }

  return parts.length ? `Filter aktif: ${parts.join(', ')}.` : 'Filter aktif: seluruh data.';
}

function validateDateString(value?: string): boolean {
  if (!value) return true;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function getGradeTrend(analytics: QualityAiAnalytics): string {
  const aiHigh = analytics.gradeDistribution.ai.A;
  const adminHigh = analytics.gradeDistribution.admin.A;
  const aiLow = analytics.gradeDistribution.ai.C;
  const adminLow = analytics.gradeDistribution.admin.C;

  if (aiHigh > adminHigh && aiLow < adminLow) {
    return '- AI cenderung merekomendasikan grade lebih tinggi daripada keputusan admin.';
  }
  if (aiHigh < adminHigh && aiLow > adminLow) {
    return '- AI cenderung lebih konservatif daripada keputusan admin.';
  }
  return '- Distribusi grade AI dan admin belum menunjukkan kecenderungan kuat.';
}

function formatRecentOverrides(
  overrides: QualityAiAnalytics['recentOverrides'],
): string {
  if (overrides.length === 0) return '- Belum ada override admin terbaru.';

  return overrides
    .slice(0, 5)
    .map((item) =>
      [
        `- ${item.submission_id} (${getWasteTypeLabel(item.waste_type)})`,
        `AI Grade: ${item.ai_quality_grade ?? 'belum tersedia'}`,
        `Final Admin: ${item.final_quality_grade ?? 'belum tersedia'}`,
        `Confidence: ${formatPercent(item.ai_quality_confidence)}`,
        `Catatan: ${item.admin_quality_notes ?? 'tidak ada'}`,
        `Tanggal: ${item.created_at}`,
      ].join(' | '),
    )
    .join('\n');
}

function getActionRecommendations(analytics: QualityAiAnalytics): string {
  const recommendations: string[] = [];

  if (analytics.ragUsage.fallback_sop > analytics.ragUsage.rag) {
    recommendations.push('- Periksa dokumen SOP di Supabase RAG.');
  }
  if (analytics.visionUsage.fallback > analytics.visionUsage.vision_llm) {
    recommendations.push(
      '- Periksa konfigurasi provider vision dan kualitas foto upload.',
    );
  }
  if (analytics.overrideRate >= 0.3) {
    recommendations.push(
      '- Review pola override untuk memperbaiki prompt, SOP, atau guideline admin.',
    );
  }
  if (
    analytics.averageConfidence != null &&
    analytics.averageConfidence < 0.6
  ) {
    recommendations.push('- Perkuat deskripsi kondisi, foto, dan kriteria SOP.');
  }
  if (analytics.agreementRate >= 0.8) {
    recommendations.push(
      '- AI sudah cukup membantu, tetapi admin tetap perlu validasi akhir.',
    );
  }

  return recommendations.length
    ? recommendations.join('\n')
    : '- Lanjutkan monitoring berkala karena belum ada sinyal risiko dominan.';
}

function buildExplanation(
  analytics: QualityAiAnalytics,
  filters: { startDate?: string; endDate?: string; wasteType?: WasteType },
): string {
  return [
    'RINGKASAN AI QUALITY ANALYTICS',
    `- Total AI Quality Check: ${formatNumber(analytics.totalQualityChecks)}`,
    `- Total keputusan admin: ${formatNumber(analytics.totalAdminDecisions)}`,
    `- Agreement Rate AI: ${formatPercent(analytics.agreementRate)}`,
    `- Override Rate Admin: ${formatPercent(analytics.overrideRate)}`,
    `- Rata-rata Confidence: ${formatPercent(analytics.averageConfidence)}`,
    `- Kasus Confidence Rendah: ${formatNumber(
      analytics.lowConfidenceReviewCount,
    )}`,
    `- ${getFilterDescription(filters)}`,
    '',
    'INTERPRETASI PERFORMA AI',
    `- ${getAgreementInterpretation(analytics.agreementRate)}`,
    '',
    'ANALISIS OVERRIDE ADMIN',
    `- Total override admin: ${formatNumber(analytics.adminOverrideCount)} dari ${formatNumber(
      analytics.totalAdminDecisions,
    )} keputusan admin.`,
    `- ${getOverrideInterpretation(analytics.overrideRate)}`,
    '',
    'ANALISIS CONFIDENCE',
    `- Rata-rata confidence: ${formatPercent(analytics.averageConfidence)}.`,
    `- ${getConfidenceInterpretation(analytics.averageConfidence)}`,
    `- Kasus confidence rendah: ${formatNumber(
      analytics.lowConfidenceReviewCount,
    )}.`,
    '',
    'PENGGUNAAN SOP / RAG',
    `- Supabase RAG: ${formatNumber(analytics.ragUsage.rag)}`,
    `- Fallback SOP: ${formatNumber(analytics.ragUsage.fallback_sop)}`,
    `- Unknown: ${formatNumber(analytics.ragUsage.unknown)}`,
    `- ${getRagUsageInterpretation(analytics.ragUsage)}`,
    '',
    'PENGGUNAAN VISION AI',
    `- Vision LLM: ${formatNumber(analytics.visionUsage.vision_llm)}`,
    `- Fallback vision: ${formatNumber(analytics.visionUsage.fallback)}`,
    `- Unknown: ${formatNumber(analytics.visionUsage.unknown)}`,
    `- ${getVisionUsageInterpretation(analytics.visionUsage)}`,
    '',
    'DISTRIBUSI GRADE',
    'AI Recommendation:',
    formatGradeCount(analytics.gradeDistribution.ai),
    'Final Admin:',
    formatGradeCount(analytics.gradeDistribution.admin),
    getGradeTrend(analytics),
    '',
    'POLA OVERRIDE GRADE',
    formatOverrideMatrix(analytics.overrideMatrix),
    '',
    'RECENT OVERRIDES',
    formatRecentOverrides(analytics.recentOverrides),
    '',
    'REKOMENDASI TINDAKAN ADMIN',
    getActionRecommendations(analytics),
    '',
    'CATATAN KEAMANAN',
    'Analytics ini hanya digunakan untuk evaluasi performa AI. AI tidak otomatis menentukan grade final, payout, wallet, atau transaksi. Admin tetap menjadi validator akhir.',
  ].join('\n');
}

const explainQualityAnalyticsTool: AgentTool = {
  name: 'explain_quality_analytics',
  description:
    'Explain AI Quality Analytics, including agreement rate, admin override rate, confidence, RAG usage, vision fallback, grade distribution, override patterns, and recent override cases. Use this when admin asks about AI quality performance, override rate, confidence, fallback vision, Supabase RAG usage, or grade accuracy.',
  parameters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    wasteType: z.enum(['food', 'oil']).optional(),
  }),
  execute: async (
    args: { startDate?: string; endDate?: string; wasteType?: WasteType },
    context?: ToolContext,
  ) => {
    if (!context?.isAuthenticated) {
      return 'Silakan login terlebih dahulu untuk melihat AI Quality Analytics.';
    }

    if (context.role !== 'admin') {
      return 'Fitur AI Quality Analytics hanya tersedia untuk admin.';
    }

    if (!qualityAuditLogService) {
      return 'Quality analytics service is not available.';
    }

    if (!validateDateString(args.startDate) || !validateDateString(args.endDate)) {
      return 'Format tanggal filter tidak valid. Gunakan format tanggal ISO atau YYYY-MM-DD.';
    }

    const analytics = await qualityAuditLogService.getAnalytics({
      startDate: args.startDate,
      endDate: args.endDate,
      wasteType: args.wasteType,
    });

    if (analytics.totalQualityChecks === 0) {
      return 'Belum ada data AI Quality Check yang cukup untuk dianalisis.';
    }

    return buildExplanation(analytics, args);
  },
};

globalToolRegistry.registerTool(explainQualityAnalyticsTool);
