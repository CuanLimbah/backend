import { z } from 'zod';
import { Model } from 'mongoose';
import { WastePriceEntity } from '../../database/schemas/price.schema';
import { AgentTool, globalToolRegistry } from './tool.registry';

let wastePriceModel: Model<WastePriceEntity> | null = null;

export function setWastePriceModel(model: Model<WastePriceEntity>) {
  wastePriceModel = model;
}

const checkWastePriceTool: AgentTool = {
  name: 'check_waste_price',
  description:
    'Look up the current price per kilogram for a specific waste type (food waste or used cooking oil). Use this when the user asks about waste prices.',
  parameters: z.object({
    waste_type: z
      .enum(['food', 'oil'])
      .describe('The type of waste: "food" for food waste, "oil" for used cooking oil'),
  }),
  execute: async (args: { waste_type?: 'food' | 'oil' }) => {
    if (!wastePriceModel) return 'Waste price service is not available.';

    if (!args.waste_type) {
      const prices = await wastePriceModel.find().lean().exec();
      if (prices.length === 0) return 'Harga limbah belum tersedia.';
      return prices
        .map((p) => {
          const label = p.waste_type === 'food' ? 'Limbah Makanan' : 'Minyak Jelantah';
          return `${label}: Rp ${p.price_per_kg.toLocaleString('id-ID')}/kg`;
        })
        .join('\n');
    }

    const price = await wastePriceModel
      .findOne({ waste_type: args.waste_type })
      .lean()
      .exec();

    if (!price) return `Harga untuk limbah "${args.waste_type}" belum tersedia.`;

    const label = args.waste_type === 'food' ? 'Limbah Makanan' : 'Minyak Jelantah';
    return `${label}: Rp ${price.price_per_kg.toLocaleString('id-ID')}/kg (update terakhir: ${price.updated_at})`;
  },
};

globalToolRegistry.registerTool(checkWastePriceTool);
