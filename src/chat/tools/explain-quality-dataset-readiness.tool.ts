import { z } from 'zod';
import type {
  QualityDatasetReadinessAnalytics,
  WasteType,
} from '../../common/models';
import { QualityCaseDatasetService } from '../../quality-dataset/quality-case-dataset.service';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let qualityCaseDatasetService: QualityCaseDatasetService | null = null;

export function setQualityCaseDatasetService(
  service: QualityCaseDatasetService,
) {
  qualityCaseDatasetService = service;
}

function formatPercent(value?: number | null): string {
  return value == null ? 'belum tersedia' : `${Math.round(value * 100)}%`;
}

function formatNumber(value?: number | null): string {
  return (value ?? 0).toLocaleString('id-ID');
}

function getWasteTypeLabel(type?: WasteType): string {
  if (type === 'oil') return 'minyak jelantah';
  if (type === 'food') return 'sisa makanan';
  return 'semua jenis limbah';
}

function validateDateString(value?: string): boolean {
  if (!value) return true;
  return !Number.isNaN(new Date(value).getTime());
}

function getReadinessInterpretation(rate: number): string {
  if (rate >= 0.8) {
    return 'Dataset cukup siap untuk tahap Multimodal RAG MVP.';
  }
  if (rate >= 0.5) {
    return 'Dataset sebagian siap, tetapi masih perlu perbaikan data.';
  }
  return 'Dataset belum siap untuk Multimodal RAG.';
}

function getEmbeddingCoverageInterpretation(rate?: number): string {
  if (rate == null) return 'Embedding coverage belum tersedia.';
  if (rate >= 0.8) return 'Embedding coverage cukup siap untuk Multimodal RAG MVP.';
  if (rate >= 0.5) return 'Embedding coverage sebagian siap.';
  return 'Embedding coverage belum cukup.';
}

function getSupabaseVectorCoverageInterpretation(rate?: number): string {
  if (rate == null) return 'Supabase vector sync coverage belum tersedia.';
  if (rate >= 0.8) {
    return 'Supabase vector sync cukup siap untuk production vector search.';
  }
  if (rate >= 0.5) {
    return 'Supabase vector sync sebagian siap, tetapi masih perlu backfill.';
  }
  return 'Supabase vector sync belum siap.';
}

function getRecommendations(analytics: QualityDatasetReadinessAnalytics): string {
  const recommendations: string[] = [];

  if (analytics.missingImageCount > 0) {
    recommendations.push('- Pastikan user wajib upload foto limbah.');
  }
  if (analytics.missingFinalGradeCount > 0) {
    recommendations.push('- Pastikan admin menyelesaikan validasi grade final.');
  }
  if (analytics.missingVisualObservationCount > 0) {
    recommendations.push(
      '- Jalankan AI Quality Check berbasis vision pada lebih banyak submission.',
    );
  }
  if (analytics.missingAdminValidationCount > 0) {
    recommendations.push('- Pastikan submission selesai diverifikasi admin.');
  }
  if ((analytics.embeddingCoverage?.missingEmbeddingCases ?? 0) > 0) {
    recommendations.push(
      '- Jalankan backfill embedding visual-text untuk eligible quality cases.',
    );
  }
  if ((analytics.supabaseVectorCoverage?.unsyncedCases ?? 0) > 0) {
    recommendations.push('- Jalankan Supabase vector backfill.');
  }
  if ((analytics.supabaseVectorCoverage?.failedSyncCases ?? 0) > 0) {
    recommendations.push('- Periksa error sinkronisasi Supabase vector.');
  }

  return recommendations.length
    ? recommendations.join('\n')
    : '- Pertahankan kualitas data historis dan evaluasi coverage embedding visual-text dari observasi visual.';
}

function buildExplanation(
  analytics: QualityDatasetReadinessAnalytics,
  filters: { startDate?: string; endDate?: string; wasteType?: WasteType },
): string {
  const filterLabel = filters.wasteType
    ? `Filter aktif: ${getWasteTypeLabel(filters.wasteType)}.`
    : 'Filter aktif: seluruh data.';

  return [
    'RINGKASAN QUALITY DATASET READINESS',
    `- Total cases: ${formatNumber(analytics.totalCases)}`,
    `- Eligible cases: ${formatNumber(analytics.eligibleCases)}`,
    `- Ineligible cases: ${formatNumber(analytics.ineligibleCases)}`,
    `- Eligibility rate: ${formatPercent(analytics.eligibilityRate)}`,
    `- Missing image: ${formatNumber(analytics.missingImageCount)}`,
    `- Missing final grade: ${formatNumber(analytics.missingFinalGradeCount)}`,
    `- Missing visual observation: ${formatNumber(
      analytics.missingVisualObservationCount,
    )}`,
    `- Missing admin validation: ${formatNumber(
      analytics.missingAdminValidationCount,
    )}`,
    `- ${filterLabel}`,
    filters.startDate || filters.endDate
      ? `- Periode: ${filters.startDate ?? 'awal'} sampai ${filters.endDate ?? 'akhir'}`
      : '- Periode: semua waktu',
    '',
    'INTERPRETASI READINESS',
    `- ${getReadinessInterpretation(analytics.eligibilityRate)}`,
    '',
    'BY WASTE TYPE',
    `- Minyak jelantah: ${formatNumber(
      analytics.byWasteType.oil.eligibleCases,
    )}/${formatNumber(analytics.byWasteType.oil.totalCases)} eligible (${formatPercent(
      analytics.byWasteType.oil.eligibilityRate,
    )})`,
    `- Sisa makanan: ${formatNumber(
      analytics.byWasteType.food.eligibleCases,
    )}/${formatNumber(analytics.byWasteType.food.totalCases)} eligible (${formatPercent(
      analytics.byWasteType.food.eligibilityRate,
    )})`,
    '',
    'DISTRIBUSI FINAL GRADE',
    `- Grade A: ${formatNumber(analytics.byFinalGrade.A)}`,
    `- Grade B: ${formatNumber(analytics.byFinalGrade.B)}`,
    `- Grade C: ${formatNumber(analytics.byFinalGrade.C)}`,
    '',
    'EMBEDDING COVERAGE',
    `- Total eligible cases: ${formatNumber(
      analytics.embeddingCoverage?.totalEligibleCases,
    )}`,
    `- Embedded cases: ${formatNumber(
      analytics.embeddingCoverage?.embeddedCases,
    )}`,
    `- Missing embedding: ${formatNumber(
      analytics.embeddingCoverage?.missingEmbeddingCases,
    )}`,
    `- Coverage rate: ${formatPercent(
      analytics.embeddingCoverage?.embeddingCoverageRate,
    )}`,
    `- ${getEmbeddingCoverageInterpretation(
      analytics.embeddingCoverage?.embeddingCoverageRate,
    )}`,
    '',
    'SUPABASE VECTOR SYNC',
    `- Total eligible cases: ${formatNumber(
      analytics.supabaseVectorCoverage?.totalEligibleCases,
    )}`,
    `- Synced cases: ${formatNumber(
      analytics.supabaseVectorCoverage?.syncedCases,
    )}`,
    `- Unsynced cases: ${formatNumber(
      analytics.supabaseVectorCoverage?.unsyncedCases,
    )}`,
    `- Failed sync cases: ${formatNumber(
      analytics.supabaseVectorCoverage?.failedSyncCases,
    )}`,
    `- Sync coverage rate: ${formatPercent(
      analytics.supabaseVectorCoverage?.syncCoverageRate,
    )}`,
    `- ${getSupabaseVectorCoverageInterpretation(
      analytics.supabaseVectorCoverage?.syncCoverageRate,
    )}`,
    '',
    'REKOMENDASI PERBAIKAN DATA',
    getRecommendations(analytics),
    '',
    'CATATAN KEAMANAN',
    'Dataset readiness digunakan untuk memantau kesiapan data historis dan embedding coverage. Pada tahap MVP ini, Multimodal RAG hanya memakai visual-text embedding dari observasi visual dan pencarian kasus historis mirip sebagai konteks tambahan. Sistem tidak menjalankan training model, auto-approval, perubahan payout, wallet update, atau transaksi otomatis. Admin tetap menjadi validator akhir.',
  ].join('\n');
}

const explainQualityDatasetReadinessTool: AgentTool = {
  name: 'explain_quality_dataset_readiness',
  description:
    'Explain whether the historical quality case dataset is ready for future Multimodal RAG. Use this for admin questions about dataset readiness, eligible historical quality cases, missing images, missing final grade, missing visual observations, or readiness before image RAG.',
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
      return 'Silakan login terlebih dahulu untuk melihat Quality Dataset Readiness.';
    }

    if (context.role !== 'admin') {
      return 'Fitur Quality Dataset Readiness hanya tersedia untuk admin.';
    }

    if (!qualityCaseDatasetService) {
      return 'Quality dataset service is not available.';
    }

    if (!validateDateString(args.startDate) || !validateDateString(args.endDate)) {
      return 'Format tanggal filter tidak valid. Gunakan format tanggal ISO atau YYYY-MM-DD.';
    }

    const analytics = await qualityCaseDatasetService.getReadinessAnalytics({
      startDate: args.startDate,
      endDate: args.endDate,
      wasteType: args.wasteType,
    });

    if (analytics.totalCases === 0) {
      return 'Belum ada quality case dataset yang bisa dianalisis.';
    }

    return buildExplanation(analytics, args);
  },
};

globalToolRegistry.registerTool(explainQualityDatasetReadinessTool);
