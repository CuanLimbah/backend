import { z } from 'zod';
import { Model } from 'mongoose';
import { WasteSubmissionEntity } from '../../database/schemas/submission.schema';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let submissionModel: Model<WasteSubmissionEntity> | null = null;

export function setQualityAssessmentSubmissionModel(
  model: Model<WasteSubmissionEntity>,
) {
  submissionModel = model;
}

const explainQualityAssessmentTool: AgentTool = {
  name: 'explain_quality_assessment',
  description:
    'Explain an existing AI quality assessment result for a user submission. Use this when the user asks about AI grade, quality recommendation, contamination level, or why AI recommended a grade.',
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

    const query = args.submission_id
      ? { id: args.submission_id, user_id: context.userId }
      : { user_id: context.userId, ai_quality_grade: { $exists: true } };
    const submissionQuery = submissionModel.findOne(query);

    if (!args.submission_id) {
      submissionQuery.sort({ ai_quality_checked_at: -1, created_at: -1 });
    }

    const submission = await submissionQuery.lean().exec();

    if (!submission) {
      return args.submission_id
        ? `Setoran dengan ID "${args.submission_id}" tidak ditemukan atau belum memiliki AI Quality Check.`
        : 'Belum ada setoran dengan hasil AI Quality Check.';
    }

    if (!submission.ai_quality_grade) {
      return 'AI Quality Check belum dijalankan untuk setoran ini.';
    }

    const source =
      submission.ai_quality_rag_source === 'rag' ? 'Supabase RAG' : 'Fallback SOP';
    const criteria = submission.ai_quality_matched_criteria?.length
      ? `\nKriteria cocok:\n${submission.ai_quality_matched_criteria.map((item) => `- ${item}`).join('\n')}`
      : '';

    return [
      `AI merekomendasikan grade ${submission.ai_quality_grade} untuk setoran ${submission.id}.`,
      `Confidence: ${Math.round((submission.ai_quality_confidence ?? 0) * 100)}%.`,
      `Tingkat kontaminasi: ${submission.ai_contamination_level ?? 'belum tersedia'}.`,
      `Sumber SOP: ${source}.`,
      `Alasan: ${submission.ai_quality_reason ?? 'Belum ada alasan tersimpan.'}`,
      criteria,
      `Tips: ${submission.ai_quality_tips ?? 'Belum ada tips tersimpan.'}`,
      'Catatan: AI hanya memberi rekomendasi. Admin tetap menentukan grade final.',
    ]
      .filter(Boolean)
      .join('\n');
  },
};

globalToolRegistry.registerTool(explainQualityAssessmentTool);
