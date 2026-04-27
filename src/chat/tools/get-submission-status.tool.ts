import { z } from 'zod';
import { Model } from 'mongoose';
import { WasteSubmissionEntity } from '../../database/schemas/submission.schema';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let submissionModel: Model<WasteSubmissionEntity> | null = null;

export function setSubmissionModel(model: Model<WasteSubmissionEntity>) {
  submissionModel = model;
}

const getSubmissionStatusTool: AgentTool = {
  name: 'get_submission_status',
  description:
    'Check the status of waste submissions for the current user. Can look up a specific submission by ID, or show the 3 most recent submissions. Requires the user to be logged in.',
  parameters: z.object({
    submission_id: z
      .string()
      .optional()
      .describe('Optional specific submission ID to look up. If omitted, returns the 3 most recent.'),
  }),
  execute: async (args: { submission_id?: string }, context?: ToolContext) => {
    if (!context?.isAuthenticated) {
      return 'Silakan login terlebih dahulu untuk melihat status setoran Anda.';
    }

    if (!submissionModel) return 'Submission service is not available.';

    if (args.submission_id) {
      const sub = await submissionModel
        .findOne({ id: args.submission_id, user_id: context.userId })
        .lean()
        .exec();

      if (!sub) return `Setoran dengan ID "${args.submission_id}" tidak ditemukan atau bukan milik Anda.`;

      const label = sub.waste_type === 'food' ? 'Limbah Makanan' : 'Minyak Jelantah';
      const weight = sub.actual_weight ?? sub.estimated_weight;
      const earnings = sub.earnings ? ` | Pendapatan: Rp ${sub.earnings.toLocaleString('id-ID')}` : '';
      return `Setoran ${sub.id}: ${label}, ${weight} kg, status: ${sub.status}${earnings}`;
    }

    const subs = await submissionModel
      .find({ user_id: context.userId })
      .sort({ created_at: -1 })
      .limit(3)
      .lean()
      .exec();

    if (subs.length === 0) return 'Anda belum memiliki setoran.';

    return subs
      .map((s) => {
        const label = s.waste_type === 'food' ? 'Makanan' : 'Minyak';
        const weight = s.actual_weight ?? s.estimated_weight;
        return `- ${s.id}: ${label}, ${weight} kg, status: ${s.status}`;
      })
      .join('\n');
  },
};

globalToolRegistry.registerTool(getSubmissionStatusTool);
