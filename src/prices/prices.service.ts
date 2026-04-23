import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WastePriceEntity } from '../database/schemas/price.schema';

@Injectable()
export class PricesService {
  constructor(
    @InjectModel(WastePriceEntity.name)
    private readonly priceModel: Model<WastePriceEntity>,
  ) {}

  findAll() {
    return this.priceModel
      .find()
      .select({ _id: 0, __v: 0 })
      .sort({ waste_type: 1 })
      .lean()
      .exec();
  }

  async update(id: string, pricePerKg: number, updatedBy: string) {
    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      throw new BadRequestException('pricePerKg harus berupa angka lebih besar dari 0');
    }

    const updatedPrice = await this.priceModel
      .findOneAndUpdate(
        { id },
        {
          price_per_kg: Math.round(pricePerKg),
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!updatedPrice) {
      throw new NotFoundException(`Harga limbah dengan id "${id}" tidak ditemukan`);
    }

    return updatedPrice;
  }
}
