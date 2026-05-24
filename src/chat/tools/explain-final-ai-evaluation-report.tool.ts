import { z } from 'zod';
import type { FinalAiEvaluationReport, WasteType } from '../../common/models';
import { QualityAuditLogService } from '../../quality-audit/quality-audit-log.service';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let qualityAuditLogService: QualityAuditLogService | null = null;

export function setFinalAiEvaluationReportService(
  service: QualityAuditLogService,
) {
  qualityAuditLogService = service;
}

function formatPercent(value?: number | null): string {
  return value == null ? 'belum tersedia' : `${Math.round(value * 100)}%`;
}

function formatNumber(value?: number | null): string {
  return (value ?? 0).toLocaleString('id-ID');
}

function getReadinessLabel(
  status: FinalAiEvaluationReport['summary']['readinessStatus'],
): string {
  if (status === 'ready') return 'Ready';
  if (status === 'partially_ready') return 'Partially Ready';
  return 'Not Ready';
}

function formatCounts(counts: Record<string, number>): string {
  const rows = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return rows.length
    ? rows.map(([key, count]) => `- ${key}: ${formatNumber(count)}`).join('\n')
    : '- Belum ada pola dominan.';
}

function formatList(items: string[], emptyMessage: string): string {
  return items.length
    ? items.map((item) => `- ${item}`).join('\n')
    : `- ${emptyMessage}`;
}

function formatChecklist(
  checklist: FinalAiEvaluationReport['demoReadinessChecklist'],
): string {
  return checklist
    .map((item) => `- ${item.label}: ${item.status} - ${item.detail}`)
    .join('\n');
}

function buildReportExplanation(report: FinalAiEvaluationReport): string {
  return [
    'RINGKASAN EVALUASI AI',
    `- Generated at: ${report.generatedAt}`,
    `- Readiness: ${getReadinessLabel(report.summary.readinessStatus)}`,
    `- Total AI Quality Check: ${formatNumber(
      report.summary.totalAiQualityChecks,
    )}`,
    `- Total keputusan admin: ${formatNumber(
      report.summary.totalAdminDecisions,
    )}`,
    `- Agreement Rate: ${formatPercent(report.summary.agreementRate)}`,
    `- Override Rate: ${formatPercent(report.summary.overrideRate)}`,
    `- Average Confidence: ${formatPercent(report.summary.averageConfidence)}`,
    '',
    'VISION & SOP RAG',
    `- Vision LLM: ${formatNumber(report.vision.visionLlmCount)}`,
    `- Vision fallback: ${formatNumber(report.vision.fallbackCount)}`,
    `- Vision usage rate: ${formatPercent(report.vision.visionUsageRate)}`,
    `- Supabase RAG: ${formatNumber(report.sopRag.ragCount)}`,
    `- Fallback SOP: ${formatNumber(report.sopRag.fallbackSopCount)}`,
    `- SOP RAG usage rate: ${formatPercent(report.sopRag.ragUsageRate)}`,
    '',
    'MULTIMODAL RAG & SUPABASE PGVECTOR',
    `- Multimodal RAG digunakan: ${formatNumber(
      report.multimodalRag.usedCount,
    )}`,
    `- Usage rate: ${formatPercent(report.multimodalRag.usageRate)}`,
    `- Supabase pgvector: ${formatNumber(
      report.multimodalRag.providerUsage.supabase_pgvector,
    )}`,
    `- Application cosine: ${formatNumber(
      report.multimodalRag.providerUsage.application_cosine,
    )}`,
    `- Fallback none: ${formatNumber(
      report.multimodalRag.providerUsage.fallback_none,
    )}`,
    `- Embedding unavailable: ${formatNumber(
      report.multimodalRag.providerUsage.embedding_unavailable,
    )}`,
    `- Average top similarity: ${formatPercent(
      report.multimodalRag.averageTopSimilarity,
    )}`,
    `- Average similar case count: ${formatNumber(
      report.multimodalRag.averageSimilarCaseCount,
    )}`,
    `- No result retrievals: ${formatNumber(
      report.multimodalRag.noResultRetrievals,
    )}`,
    '',
    'DATASET READINESS',
    `- Eligible cases: ${formatNumber(report.dataset.totalEligibleCases)}`,
    `- Embedding coverage: ${formatPercent(
      report.dataset.embeddingCoverageRate,
    )}`,
    `- Supabase vector sync coverage: ${formatPercent(
      report.dataset.supabaseVectorSyncCoverageRate,
    )}`,
    '',
    'POLA OVERRIDE ADMIN',
    'Most common override reasons:',
    formatCounts(report.qualityOutcomes.mostCommonOverrideReasons),
    'Most common AI error patterns:',
    formatCounts(report.qualityOutcomes.mostCommonAiErrorPatterns),
    '',
    'RISIKO',
    formatList(report.risks, 'Tidak ada risiko dominan.'),
    '',
    'REKOMENDASI',
    formatList(report.recommendations, 'Lanjutkan monitoring berkala.'),
    '',
    'DEMO READINESS CHECKLIST',
    formatChecklist(report.demoReadinessChecklist),
    '',
    'CATATAN KEAMANAN',
    'AI hanya memberi rekomendasi kualitas. Grade final, payout, wallet, dan transaksi tetap ditentukan oleh proses validasi admin dan backend bisnis.',
  ].join('\n');
}

const explainFinalAiEvaluationReportTool: AgentTool = {
  name: 'explain_final_ai_evaluation_report',
  description:
    'Explain the final AI evaluation report for demo/proposal readiness, including AI Quality Check, Vision, SOP RAG, Multimodal RAG, Supabase pgvector, dataset readiness, override patterns, risks, recommendations, and demo readiness checklist. Use this when admin asks laporan akhir AI, final AI evaluation, apakah fitur AI siap demo, AI readiness, atau evaluasi akhir AI.',
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
      return 'Silakan login terlebih dahulu untuk melihat Final AI Evaluation Report.';
    }

    if (context.role !== 'admin') {
      return 'Final AI Evaluation Report hanya tersedia untuk admin.';
    }

    if (!qualityAuditLogService) {
      return 'Final AI evaluation report service is not available.';
    }

    const report = await qualityAuditLogService.getFinalAiEvaluationReport(args);
    return buildReportExplanation(report);
  },
};

globalToolRegistry.registerTool(explainFinalAiEvaluationReportTool);
