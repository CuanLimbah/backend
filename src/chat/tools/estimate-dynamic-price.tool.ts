import { z } from 'zod';
import { PricingService } from '../../pricing/pricing.service';
import { AgentTool, globalToolRegistry } from './tool.registry';

let pricingService: PricingService | null = null;

export function setPricingService(service: PricingService) {
  pricingService = service;
}

const estimateDynamicPriceTool: AgentTool = {
  name: 'estimate_dynamic_price',
  description:
    'Estimate dynamic waste payout using waste type, estimated weight, and optional quality grade. Use this for estimasi cuan, dynamic pricing, kualitas limbah, grade, or perkiraan harga questions.',
  parameters: z.object({
    waste_type: z
      .enum(['food', 'oil'])
      .describe('The waste type: "food" for food waste or "oil" for used cooking oil'),
    estimated_weight: z
      .number()
      .positive()
      .describe('Estimated waste weight in kilograms'),
    quality_grade: z
      .enum(['A', 'B', 'C'])
      .optional()
      .describe('Optional quality grade. Defaults to A.'),
  }),
  execute: async (args: {
    waste_type: 'food' | 'oil';
    estimated_weight: number;
    quality_grade?: 'A' | 'B' | 'C';
  }) => {
    if (!pricingService) return 'Pricing service is not available.';

    const result = await pricingService.calculateEstimate({
      wasteType: args.waste_type,
      weightKg: args.estimated_weight,
      qualityGrade: args.quality_grade,
      useLatestPrice: true,
    });

    return result.explanation;
  },
};

globalToolRegistry.registerTool(estimateDynamicPriceTool);
