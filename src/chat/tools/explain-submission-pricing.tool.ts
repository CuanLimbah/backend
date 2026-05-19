import { z } from 'zod';
import { Model } from 'mongoose';
import { WasteSubmissionEntity } from '../../database/schemas/submission.schema';
import { AgentTool, ToolContext, globalToolRegistry } from './tool.registry';

let submissionModel: Model<WasteSubmissionEntity> | null = null;

export function setPricingSubmissionModel(model: Model<WasteSubmissionEntity>) {
  submissionModel = model;
}

function formatRupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function getWasteTypeLabel(wasteType: WasteSubmissionEntity['waste_type']): string {
  return wasteType === 'food' ? 'limbah makanan' : 'minyak jelantah';
}

function hasDynamicPricingFields(submission: WasteSubmissionEntity): boolean {
  return Boolean(
    submission.quality_grade ||
      submission.price_snapshot_per_kg != null ||
      submission.final_price_per_kg != null ||
      submission.pricing_explanation,
  );
}

function buildDynamicPricingExplanation(submission: WasteSubmissionEntity): string {
  const lines = [
    `Setoran ${submission.id} (${getWasteTypeLabel(submission.waste_type)}) sudah dihitung dengan dynamic pricing.`,
  ];

  if (submission.actual_weight != null) {
    lines.push(`Berat aktual: ${submission.actual_weight} kg.`);
  }

  if (submission.quality_grade) {
    lines.push(`Grade kualitas: ${submission.quality_grade}.`);
  }

  if (submission.price_snapshot_per_kg != null) {
    lines.push(
      `Harga dasar saat submit: ${formatRupiah(submission.price_snapshot_per_kg)}/kg.`,
    );
  }

  if (submission.final_price_per_kg != null) {
    lines.push(
      `Harga final / kg: ${formatRupiah(submission.final_price_per_kg)}/kg.`,
    );
  }

  if (submission.earnings != null) {
    lines.push(`Total Cuan: ${formatRupiah(submission.earnings)}.`);
  }

  if (submission.pricing_explanation) {
    lines.push(`Penjelasan Harga: ${submission.pricing_explanation}`);
  }

  return lines.join('\n');
}

const explainSubmissionPricingTool: AgentTool = {
  name: 'explain_submission_pricing',
  description:
    "Explain the final dynamic pricing breakdown for a user's completed waste submission. Use this when the user asks why their Cuan amount changed, why a grade affected price, or how final payout was calculated.",
  parameters: z.object({
    submission_id: z.string().optional(),
  }),
  execute: async (
    args: { submission_id?: string },
    context?: ToolContext,
  ) => {
    if (!context?.isAuthenticated) {
      return 'Silakan login terlebih dahulu untuk melihat penjelasan harga setoran Anda.';
    }

    if (!submissionModel) return 'Submission service is not available.';

    const query = args.submission_id
      ? { id: args.submission_id, user_id: context.userId }
      : { user_id: context.userId, status: 'completed' };

    const submissionQuery = submissionModel.findOne(query);

    if (!args.submission_id) {
      submissionQuery.sort({ completed_at: -1, verified_at: -1, created_at: -1 });
    }

    const submission = await submissionQuery.lean().exec();

    if (!submission) {
      return args.submission_id
        ? `Setoran dengan ID "${args.submission_id}" tidak ditemukan atau bukan milik Anda.`
        : 'Anda belum memiliki setoran selesai yang bisa dijelaskan harganya.';
    }

    if (submission.status !== 'completed') {
      return 'Harga final belum tersedia karena setoran masih menunggu verifikasi.';
    }

    if (hasDynamicPricingFields(submission)) {
      return buildDynamicPricingExplanation(submission);
    }

    if (submission.earnings != null) {
      const weight =
        submission.actual_weight != null
          ? ` dengan berat aktual ${submission.actual_weight} kg`
          : '';
      return `Setoran ini belum memiliki breakdown dynamic pricing lengkap, tetapi total Cuan tercatat sebesar ${formatRupiah(submission.earnings)}${weight}.`;
    }

    return 'Setoran ini belum memiliki breakdown dynamic pricing lengkap dan total Cuan belum tersedia.';
  },
};

globalToolRegistry.registerTool(explainSubmissionPricingTool);
