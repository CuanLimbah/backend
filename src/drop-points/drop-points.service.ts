import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DropPointEntity } from '../database/schemas/drop-point.schema';
import { MapsService } from '../infrastructure/maps.service';

type FindDropPointsQuery = {
  lat?: string;
  lng?: string;
  radiusKm?: string;
  address?: string;
};

@Injectable()
export class DropPointsService {
  constructor(
    @InjectModel(DropPointEntity.name)
    private readonly dropPointModel: Model<DropPointEntity>,
    private readonly mapsService: MapsService,
  ) {}

  async findAll(query: FindDropPointsQuery = {}) {
    const radiusKm = query.radiusKm ? Number(query.radiusKm) : 25;

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new BadRequestException('radiusKm harus lebih besar dari 0');
    }

    let latitude = query.lat ? Number(query.lat) : undefined;
    let longitude = query.lng ? Number(query.lng) : undefined;

    if (query.address?.trim()) {
      const geocodedAddress = await this.mapsService.geocodeAddress(query.address.trim());
      latitude = geocodedAddress.latitude;
      longitude = geocodedAddress.longitude;
    }

    if (
      (query.lat || query.lng) &&
      (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    ) {
      throw new BadRequestException('lat dan lng harus berupa angka valid');
    }

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return this.dropPointModel
        .find({
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [longitude, latitude],
              },
              $maxDistance: Math.round(radiusKm * 1000),
            },
          },
        })
        .select({ _id: 0, __v: 0, location: 0 })
        .lean()
        .exec();
    }

    return this.dropPointModel
      .find()
      .select({ _id: 0, __v: 0, location: 0 })
      .sort({ name: 1 })
      .lean()
      .exec();
  }
}
