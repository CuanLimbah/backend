import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { hashPassword, toPlainObject, toPublicUser } from '../common/utils';
import { PublicUser, UserRecord } from '../common/models';
import { UserEntity } from '../database/schemas/user.schema';
import { PickupRoutesService } from '../pickup-routes/pickup-routes.service';
import { CreateDriverDto } from './dto/create-driver.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly pickupRoutesService: PickupRoutesService,
  ) {}

  async create(dto: CreateDriverDto) {
    const fullName = dto.fullName?.trim();
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password?.trim();
    const phoneNumber = dto.phoneNumber?.trim() || undefined;
    const vehicleNumber = dto.vehicleNumber?.trim() || undefined;

    if (!fullName) {
      throw new BadRequestException('Nama driver wajib diisi');
    }

    if (!email) {
      throw new BadRequestException('Email driver wajib diisi');
    }

    if (!password || password.length < 8) {
      throw new BadRequestException('Password driver minimal 8 karakter');
    }

    if (await this.userModel.exists({ email })) {
      throw new BadRequestException('Email driver sudah terdaftar');
    }

    const createdDriver = await this.userModel.create({
      id: `driver-${randomUUID()}`,
      email,
      full_name: fullName,
      password_hash: hashPassword(password),
      role: 'driver',
      status: 'active',
      created_at: new Date().toISOString(),
      phone_number: phoneNumber,
      vehicle_number: vehicleNumber,
    });

    return toPublicUser(toPlainObject(createdDriver) as unknown as UserRecord);
  }

  async findAll() {
    const drivers = await this.userModel
      .find({ role: 'driver' })
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();

    return drivers.map((driver) => toPublicUser(driver as UserRecord));
  }

  async getDashboard(driverId: string) {
    const driver = await this.userModel
      .findOne({ id: driverId, role: 'driver' })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!driver) {
      throw new BadRequestException('Driver tidak ditemukan');
    }

    const routes = await this.pickupRoutesService.findForDriver(driverId);

    return {
      driver: toPublicUser(driver as UserRecord) as PublicUser,
      routes,
      stats: {
        assigned: routes.filter((route) => route.status === 'assigned').length,
        active: routes.filter((route) =>
          ['assigned', 'on_the_way', 'picked_up'].includes(route.status),
        ).length,
        completed: routes.filter((route) => route.status === 'completed').length,
      },
    };
  }
}
