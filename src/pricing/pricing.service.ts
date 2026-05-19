import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { QualityGrade, WasteType } from '../common/models';
import { toCurrencyAmount } from '../common/utils';
import { WastePriceEntity } from '../database/schemas/price.schema';
import {
  PRICING_MODEL_VERSION,
  PricingInput,
  PricingResult,
} from './pricing.types';

const QUALITY_MULTIPLIERS: Record<WasteType, Record<QualityGrade, number>> = {
  oil: {
    A: 1,
    B: 0.85,
    C: 0.6,
  },
  food: {
    A: 1,
    B: 0.7,
    C: 0,
  },
};

const DEFAULT_VOLUME_MULTIPLIER = 1;

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(WastePriceEntity.name)
    private readonly priceModel: Model<WastePriceEntity>,
  ) {}

  calculateEstimate(input: PricingInput): Promise<PricingResult> {
    return this.calculate(input, 'estimate');
  }

  calculateFinalPrice(input: PricingInput): Promise<PricingResult> {
    return this.calculate(input, 'final');
  }

  async getCurrentBasePricePerKg(wasteType: WasteType): Promise<number> {
    this.assertWasteType(wasteType);

    const price = await this.priceModel
      .findOne({ waste_type: wasteType })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!price) {
      throw new NotFoundException('Harga untuk jenis limbah ini tidak ditemukan');
    }

    return this.normalizePositiveNumber(price.price_per_kg, 'price_per_kg');
  }

  private async calculate(
    input: PricingInput,
    mode: 'estimate' | 'final',
  ): Promise<PricingResult> {
    this.assertWasteType(input.wasteType);

    const weightKg = this.normalizePositiveNumber(input.weightKg, 'weightKg');
    const qualityGrade = input.qualityGrade ?? 'A';
    this.assertQualityGrade(qualityGrade);

    const basePricePerKg =
      input.priceSnapshotPerKg != null && input.useLatestPrice !== true
        ? this.normalizePositiveNumber(
            input.priceSnapshotPerKg,
            'priceSnapshotPerKg',
          )
        : await this.getCurrentBasePricePerKg(input.wasteType);

    const qualityMultiplier = QUALITY_MULTIPLIERS[input.wasteType][qualityGrade];
    const volumeMultiplier = this.getVolumeMultiplier(input.wasteType, weightKg);
    const finalPricePerKg = toCurrencyAmount(
      basePricePerKg * qualityMultiplier * volumeMultiplier,
    );
    const earnings = toCurrencyAmount(finalPricePerKg * weightKg);
    const zeroPayout = earnings === 0;
    const zeroPayoutReason =
      input.wasteType === 'food' && qualityGrade === 'C'
        ? 'Limbah makanan grade C tidak memiliki nilai payout pada model MVP.'
        : undefined;

    return {
      wasteType: input.wasteType,
      weightKg,
      qualityGrade,
      basePricePerKg,
      qualityMultiplier,
      volumeMultiplier,
      finalPricePerKg,
      earnings,
      pricingModelVersion: PRICING_MODEL_VERSION,
      breakdown: {
        formula:
          'basePricePerKg x qualityMultiplier x volumeMultiplier x weightKg',
        basePricePerKg,
        qualityMultiplier,
        volumeMultiplier,
        weightKg,
        zeroPayout,
        zeroPayoutReason,
      },
      explanation: this.buildExplanation({
        wasteType: input.wasteType,
        weightKg,
        qualityGrade,
        basePricePerKg,
        qualityMultiplier,
        volumeMultiplier,
        finalPricePerKg,
        earnings,
        zeroPayout,
        mode,
      }),
    };
  }

  private getVolumeMultiplier(_wasteType: WasteType, _weightKg: number): number {
    return DEFAULT_VOLUME_MULTIPLIER;
  }

  private buildExplanation(input: {
    wasteType: WasteType;
    weightKg: number;
    qualityGrade: QualityGrade;
    basePricePerKg: number;
    qualityMultiplier: number;
    volumeMultiplier: number;
    finalPricePerKg: number;
    earnings: number;
    zeroPayout: boolean;
    mode: 'estimate' | 'final';
  }): string {
    const label =
      input.wasteType === 'food' ? 'limbah makanan' : 'minyak jelantah';
    const prefix = input.mode === 'estimate' ? 'Estimasi cuan' : 'Cuan final';

    if (input.zeroPayout) {
      return `${prefix} untuk ${input.weightKg} kg ${label} grade ${input.qualityGrade} adalah Rp ${input.earnings.toLocaleString('id-ID')}. Perhitungan: harga dasar Rp ${input.basePricePerKg.toLocaleString('id-ID')}/kg x multiplier kualitas ${this.formatMultiplier(input.qualityMultiplier)} x multiplier volume ${this.formatMultiplier(input.volumeMultiplier)}. Grade ini menghasilkan payout nol pada model pricing MVP, namun setoran tetap perlu diputuskan oleh admin.`;
    }

    return `${prefix} untuk ${input.weightKg} kg ${label} grade ${input.qualityGrade} adalah Rp ${input.earnings.toLocaleString('id-ID')}. Perhitungan: harga dasar Rp ${input.basePricePerKg.toLocaleString('id-ID')}/kg x multiplier kualitas ${this.formatMultiplier(input.qualityMultiplier)} x multiplier volume ${this.formatMultiplier(input.volumeMultiplier)} = Rp ${input.finalPricePerKg.toLocaleString('id-ID')}/kg.`;
  }

  private assertWasteType(wasteType: WasteType): void {
    if (wasteType !== 'food' && wasteType !== 'oil') {
      throw new BadRequestException('Jenis limbah tidak didukung');
    }
  }

  private assertQualityGrade(qualityGrade: QualityGrade): void {
    if (!['A', 'B', 'C'].includes(qualityGrade)) {
      throw new BadRequestException('qualityGrade harus A, B, atau C');
    }
  }

  private normalizePositiveNumber(value: number, fieldName: string): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new BadRequestException(`${fieldName} harus lebih besar dari 0`);
    }

    return numericValue;
  }

  private formatMultiplier(value: number): string {
    return value.toLocaleString('id-ID', {
      maximumFractionDigits: 2,
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    });
  }
}
