import { z } from 'zod';
import type {
  QualityAiAnalytics,
  QualityGrade,
  WasteType,
} from '../../common/models';
import { QualityAuditLogService } from '../../quality-audit/quality-audit-log.service';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let qualityAuditLogService: QualityAuditLogService | null = null;

const gradeRank: Record<QualityGrade, number> = {
  A: 3,
  B: 2,
  C: 1,
};

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
  const [from, to] = transition.split('->') as [QualityGrade, QualityGrade];

  if (!gradeRank[from] || !gradeRank[to]) {
    return 'pola override tercatat';
  }

  if (gradeRank[to] > gradeRank[from]) {
    return 'admin menaikkan grade dari rekomendasi AI';
  }

  if (gradeRank[to] < gradeRank[from]) {
    return 'admin menurunkan grade dari rekomendasi AI';
  }

  return 'grade final sama dengan rekomendasi AI';
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

function getMultimodalRagInterpretation(
  multimodal: QualityAiAnalytics['multimodalRag'],
): string {
  const notes: string[] = [];

  if (multimodal.usedCount === 0) {
    notes.push('- Multimodal RAG belum cukup digunakan untuk dievaluasi.');
  }

  if (multimodal.adminDecisionCountWhenUsed < 5) {
    notes.push(
      '- Data keputusan admin saat Multimodal RAG digunakan masih sedikit, sehingga interpretasi harus hati-hati.',
    );
  }

  if (
    multimodal.adminDecisionCountWhenUsed > 0 &&
    multimodal.adminDecisionCountWhenNotUsed > 0
  ) {
    if (multimodal.overrideRateWhenUsed < multimodal.overrideRateWhenNotUsed) {
      notes.push(
        '- Indikasi awal Multimodal RAG membantu karena override rate lebih rendah saat kasus historis mirip tersedia.',
      );
    } else if (
      multimodal.overrideRateWhenUsed > multimodal.overrideRateWhenNotUsed
    ) {
      notes.push(
        '- Override rate masih lebih tinggi saat Multimodal RAG digunakan. Perlu audit apakah kasus historis yang diambil benar-benar relevan.',
      );
    }
  }

  if (
    multimodal.averageTopSimilarityScore != null &&
    multimodal.averageTopSimilarityScore < 0.7
  ) {
    notes.push(
      '- Rata-rata similarity masih rendah, sehingga kualitas retrieval perlu ditinjau.',
    );
  }

  if (multimodal.embeddingUnavailableCount > 0) {
    notes.push(
      '- Embedding visual-text sering tidak tersedia. Jalankan backfill embedding atau cek konfigurasi embedding provider.',
    );
  }

  if (multimodal.noSimilarCaseCount > 0) {
    notes.push(
      '- Banyak AI Quality Check belum menemukan kasus historis mirip. Dataset eligible atau embedding coverage perlu ditingkatkan.',
    );
  }
  if ((multimodal.providerUsage?.application_cosine ?? 0) > 0) {
    notes.push(
      '- Sebagian retrieval masih memakai fallback application-level cosine similarity.',
    );
  }
  if ((multimodal.providerUsage?.supabase_pgvector ?? 0) > 0) {
    notes.push(
      '- Supabase pgvector sudah digunakan sebagai production vector search.',
    );
  }

  return notes.length
    ? notes.join('\n')
    : '- Belum ada sinyal risiko dominan pada Multimodal RAG.';
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

function formatCounts(
  counts: Record<string, number> | undefined,
  emptyMessage: string,
): string {
  const rows = Object.entries(counts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) return emptyMessage;

  return rows
    .map(([key, count]) => `- ${key}: ${formatNumber(count)}`)
    .join('\n');
}

function hasFeedbackData(analytics: QualityAiAnalytics): boolean {
  return [
    analytics.feedbackTagCounts,
    analytics.primaryOverrideReasons,
    analytics.aiErrorPatterns,
  ].some((counts) => Object.values(counts ?? {}).some((count) => count > 0));
}

function formatFeedbackPatterns(analytics: QualityAiAnalytics): string {
  if (!hasFeedbackData(analytics)) {
    return 'Belum ada feedback terstruktur dari admin.';
  }

  return [
    'Feedback tags:',
    formatCounts(
      analytics.feedbackTagCounts,
      '- Belum ada feedback tag tersimpan.',
    ),
    'Primary override reasons:',
    formatCounts(
      analytics.primaryOverrideReasons,
      '- Belum ada primary reason tersimpan.',
    ),
    'AI error patterns:',
    formatCounts(
      analytics.aiErrorPatterns,
      '- Belum ada AI error pattern tersimpan.',
    ),
  ].join('\n');
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
  if ((analytics.aiErrorPatterns.ai_too_optimistic ?? 0) > 0) {
    recommendations.push(
      '- AI cenderung terlalu optimistis. Pertimbangkan memperketat prompt grading dan SOP Grade A/B.',
    );
  }
  if ((analytics.aiErrorPatterns.ai_too_conservative ?? 0) > 0) {
    recommendations.push(
      '- AI cenderung terlalu konservatif. Pertimbangkan mengevaluasi threshold kontaminasi.',
    );
  }
  if (
    (analytics.feedbackTagCounts.visual_missed_sediment ?? 0) > 0 ||
    (analytics.feedbackTagCounts.visual_missed_water ?? 0) > 0
  ) {
    recommendations.push(
      '- Perkuat prompt vision untuk memperhatikan endapan dan campuran air.',
    );
  }
  if (
    (analytics.feedbackTagCounts.sop_mismatch ?? 0) > 0 ||
    (analytics.feedbackTagCounts.rag_context_insufficient ?? 0) > 0
  ) {
    recommendations.push('- Perbaiki dokumen SOP dan retrieval Supabase RAG.');
  }
  if ((analytics.feedbackTagCounts.photo_unclear ?? 0) > 0) {
    recommendations.push('- Tambahkan panduan upload foto untuk user.');
  }
  if (analytics.multimodalRag.embeddingUnavailableCount > 0) {
    recommendations.push(
      '- Jalankan backfill embedding visual-text untuk eligible quality cases.',
    );
  }
  if (analytics.multimodalRag.noSimilarCaseCount > 0) {
    recommendations.push(
      '- Perbanyak dataset historis tervalidasi dan pastikan embedding coverage meningkat.',
    );
  }
  if (
    analytics.multimodalRag.averageTopSimilarityScore != null &&
    analytics.multimodalRag.averageTopSimilarityScore < 0.7
  ) {
    recommendations.push(
      '- Evaluasi threshold similarity dan kualitas visual observation text.',
    );
  }
  if (
    analytics.multimodalRag.adminDecisionCountWhenUsed > 0 &&
    analytics.multimodalRag.adminDecisionCountWhenNotUsed > 0 &&
    analytics.multimodalRag.overrideRateWhenUsed <
      analytics.multimodalRag.overrideRateWhenNotUsed
  ) {
    recommendations.push(
      '- Pertahankan retrieval kasus historis sebagai konteks tambahan, tetapi admin tetap harus validasi akhir.',
    );
  }
  if ((analytics.multimodalRag.providerUsage?.application_cosine ?? 0) > 0) {
    recommendations.push(
      '- Supabase vector search belum dominan. Periksa Supabase vector sync coverage dan RPC.',
    );
  }
  if ((analytics.multimodalRag.providerUsage?.supabase_pgvector ?? 0) > 0) {
    recommendations.push(
      '- Production vector search sudah aktif sebagai retrieval utama.',
    );
  }
  if (
    analytics.multimodalRag.adminDecisionCountWhenUsed > 0 &&
    analytics.multimodalRag.adminDecisionCountWhenNotUsed > 0 &&
    analytics.multimodalRag.overrideRateWhenUsed >
      analytics.multimodalRag.overrideRateWhenNotUsed
  ) {
    recommendations.push(
      '- Audit similar case retrieval dan cek apakah kasus yang mirip benar-benar satu jenis limbah dan pola kualitasnya relevan.',
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
    'MULTIMODAL RAG PERFORMANCE',
    `- Total AI Quality Check: ${formatNumber(
      analytics.multimodalRag.totalAiQualityChecks,
    )}`,
    `- Multimodal RAG digunakan: ${formatNumber(
      analytics.multimodalRag.usedCount,
    )}`,
    `- Usage rate: ${formatPercent(analytics.multimodalRag.usageRate)}`,
    `- Embedding unavailable: ${formatNumber(
      analytics.multimodalRag.embeddingUnavailableCount,
    )}`,
    `- Tidak ada kasus mirip: ${formatNumber(
      analytics.multimodalRag.noSimilarCaseCount,
    )}`,
    `- Rata-rata jumlah kasus mirip: ${formatNumber(
      analytics.multimodalRag.averageSimilarCaseCount,
    )}`,
    `- Rata-rata top similarity: ${formatPercent(
      analytics.multimodalRag.averageTopSimilarityScore,
    )}`,
    `- Override rate saat Multimodal RAG digunakan: ${formatPercent(
      analytics.multimodalRag.overrideRateWhenUsed,
    )}`,
    `- Override rate saat Multimodal RAG tidak digunakan: ${formatPercent(
      analytics.multimodalRag.overrideRateWhenNotUsed,
    )}`,
    `- Agreement rate saat Multimodal RAG digunakan: ${formatPercent(
      analytics.multimodalRag.agreementRateWhenUsed,
    )}`,
    `- Agreement rate saat Multimodal RAG tidak digunakan: ${formatPercent(
      analytics.multimodalRag.agreementRateWhenNotUsed,
    )}`,
    `- Confidence saat digunakan: ${formatPercent(
      analytics.multimodalRag.averageConfidenceWhenUsed,
    )}`,
    `- Confidence saat tidak digunakan: ${formatPercent(
      analytics.multimodalRag.averageConfidenceWhenNotUsed,
    )}`,
    `- Provider Supabase pgvector: ${formatNumber(
      analytics.multimodalRag.providerUsage?.supabase_pgvector,
    )}`,
    `- Provider application cosine fallback: ${formatNumber(
      analytics.multimodalRag.providerUsage?.application_cosine,
    )}`,
    `- Provider fallback none: ${formatNumber(
      analytics.multimodalRag.providerUsage?.fallback_none,
    )}`,
    `- Provider embedding unavailable: ${formatNumber(
      analytics.multimodalRag.providerUsage?.embedding_unavailable,
    )}`,
    `- Provider unknown: ${formatNumber(
      analytics.multimodalRag.providerUsage?.unknown,
    )}`,
    '',
    'INTERPRETASI MULTIMODAL RAG',
    getMultimodalRagInterpretation(analytics.multimodalRag),
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
    'POLA FEEDBACK ADMIN',
    formatFeedbackPatterns(analytics),
    '',
    'RECENT OVERRIDES',
    formatRecentOverrides(analytics.recentOverrides),
    '',
    'REKOMENDASI TINDAKAN ADMIN',
    getActionRecommendations(analytics),
    '',
    'CATATAN KEAMANAN',
    'Analytics ini hanya digunakan untuk evaluasi performa AI. AI tidak otomatis menentukan grade final, payout, wallet, atau transaksi. Admin tetap menjadi validator akhir.',
    'Multimodal RAG hanya memberi konteks tambahan dari kasus historis. AI tidak otomatis menentukan grade final, payout, wallet, atau transaksi. Admin tetap menjadi validator akhir.',
  ].join('\n');
}

const explainQualityAnalyticsTool: AgentTool = {
  name: 'explain_quality_analytics',
  description:
    'Explain AI Quality Analytics, including agreement rate, admin override rate, confidence, RAG usage, vision fallback, Multimodal RAG performance, similar cases, retrieval quality, top similarity, embedding unavailable, grade distribution, override patterns, and recent override cases. Use this when admin asks about AI quality performance, Multimodal RAG, similar historical cases, override rate with or without Multimodal RAG, confidence, fallback vision, Supabase RAG usage, or grade accuracy.',
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
