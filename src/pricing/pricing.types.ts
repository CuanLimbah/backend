import type { QualityGrade, WasteType } from '../common/models';

export const PRICING_MODEL_VERSION = 'dynamic-pricing-mvp-v1';

export interface PricingInput {
  wasteType: WasteType;
  weightKg: number;
  qualityGrade?: QualityGrade;
  priceSnapshotPerKg?: number;
  useLatestPrice?: boolean;
}

export interface PricingBreakdown {
  formula: string;
  basePricePerKg: number;
  qualityMultiplier: number;
  volumeMultiplier: number;
  weightKg: number;
  zeroPayout: boolean;
  zeroPayoutReason?: string;
}

export interface PricingResult {
  wasteType: WasteType;
  weightKg: number;
  qualityGrade: QualityGrade;
  basePricePerKg: number;
  qualityMultiplier: number;
  volumeMultiplier: number;
  finalPricePerKg: number;
  earnings: number;
  pricingModelVersion: string;
  breakdown: PricingBreakdown;
  explanation: string;
}
