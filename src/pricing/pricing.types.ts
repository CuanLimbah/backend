import type { QualityGrade, WasteQuantityUnit, WasteType } from '../common/models';

export const PRICING_MODEL_VERSION = 'dynamic-pricing-mvp-v1';

export interface PricingInput {
  wasteType: WasteType;
  weightKg: number;
  unit?: WasteQuantityUnit;
  qualityGrade?: QualityGrade;
  priceSnapshotPerKg?: number;
  useLatestPrice?: boolean;
}

export interface PricingBreakdown {
  formula: string;
  basePricePerKg: number;
  basePricePerUnit: number;
  qualityMultiplier: number;
  volumeMultiplier: number;
  weightKg: number;
  quantity: number;
  unit: WasteQuantityUnit;
  quantityLabel: string;
  finalPricePerUnit?: number;
  zeroPayout: boolean;
  zeroPayoutReason?: string;
}

export interface PricingResult {
  wasteType: WasteType;
  weightKg: number;
  qualityGrade: QualityGrade;
  basePricePerKg: number;
  basePricePerUnit: number;
  qualityMultiplier: number;
  volumeMultiplier: number;
  finalPricePerKg: number;
  finalPricePerUnit: number;
  quantity: number;
  unit: WasteQuantityUnit;
  quantityLabel: string;
  earnings: number;
  pricingModelVersion: string;
  breakdown: PricingBreakdown;
  explanation: string;
}
