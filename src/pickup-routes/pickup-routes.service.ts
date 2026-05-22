import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type { PickupRouteStatus } from '../common/models';
import { DropPointEntity } from '../database/schemas/drop-point.schema';
import { PickupRouteEntity } from '../database/schemas/pickup-route.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { UserEntity } from '../database/schemas/user.schema';
import {
  ACTIVITY_JOB_LOG,
  ACTIVITY_QUEUE,
} from '../infrastructure/queues.constants';
import { AssignPickupRouteDto } from './dto/assign-pickup-route.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { UpdatePickupRouteStatusDto } from './dto/update-pickup-route-status.dto';

@Injectable()
export class PickupRoutesService {
  constructor(
    @InjectModel(PickupRouteEntity.name)
    private readonly pickupRouteModel: Model<PickupRouteEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectModel(DropPointEntity.name)
    private readonly dropPointModel: Model<DropPointEntity>,
    @InjectQueue(ACTIVITY_QUEUE)
    private readonly activityQueue: Queue,
  ) {}

  async assign(dto: AssignPickupRouteDto, adminId: string) {
    const submissionId = dto.submissionId?.trim();
    const driverId = dto.driverId?.trim();
    const dropPointId = dto.dropPointId?.trim();

    if (!submissionId || !driverId || !dropPointId) {
      throw new BadRequestException('submissionId, driverId, dan dropPointId wajib diisi');
    }

    const [submission, driver, dropPoint, existingRoute] = await Promise.all([
      this.submissionModel.findOne({ id: submissionId }).lean().exec(),
      this.userModel
        .findOne({ id: driverId, role: 'driver', status: 'active' })
        .lean()
        .exec(),
      this.dropPointModel.findOne({ id: dropPointId }).lean().exec(),
      this.pickupRouteModel
        .findOne({
          submission_id: submissionId,
          status: { $ne: 'cancelled' },
        })
        .lean()
        .exec(),
    ]);

    if (!submission) {
      throw new NotFoundException('Setoran tidak ditemukan');
    }

    if (!driver) {
      throw new NotFoundException('Driver aktif tidak ditemukan');
    }

    if (!dropPoint) {
      throw new NotFoundException('Drop point tidak ditemukan');
    }

    if (existingRoute) {
      throw new BadRequestException('Setoran ini sudah memiliki rute penjemputan aktif');
    }

    if (submission.status !== 'pending') {
      throw new BadRequestException('Hanya setoran pending yang bisa dijadwalkan');
    }

    const now = new Date();
    const routeId = `route-${randomUUID()}`;
    const createdRoute = await this.pickupRouteModel.create({
      id: routeId,
      submission_id: submission.id,
      user_id: submission.user_id,
      driver_id: driver.id,
      drop_point_id: dropPoint.id,
      address: dropPoint.address,
      latitude: dropPoint.latitude,
      longitude: dropPoint.longitude,
      scheduled_at: dto.scheduledAt?.trim() || now.toISOString(),
      status: 'assigned',
      created_at: now.toISOString(),
      notes: dto.notes?.trim() || `Dijadwalkan oleh ${adminId}`,
    });

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'pickup_route.assigned',
      entityType: 'pickup_route',
      entityId: routeId,
      payload: {
        admin_id: adminId,
        driver_id: driver.id,
        submission_id: submission.id,
        drop_point_id: dropPoint.id,
      },
    });

    return this.enrichRoute(createdRoute.toObject());
  }

  async findAll() {
    const routes = await this.pickupRouteModel
      .find()
      .select({ _id: 0, __v: 0 })
      .sort({ scheduled_at: -1 })
      .lean()
      .exec();

    return Promise.all(routes.map((route) => this.enrichRoute(route)));
  }

  async findForDriver(driverId: string) {
    const routes = await this.pickupRouteModel
      .find({ driver_id: driverId })
      .select({ _id: 0, __v: 0 })
      .sort({ scheduled_at: -1 })
      .lean()
      .exec();

    return Promise.all(routes.map((route) => this.enrichRoute(route)));
  }

  async findForUser(userId: string) {
    const routes = await this.pickupRouteModel
      .find({ user_id: userId })
      .select({ _id: 0, __v: 0 })
      .sort({ scheduled_at: -1 })
      .lean()
      .exec();

    return Promise.all(routes.map((route) => this.enrichRoute(route)));
  }

  async updateStatus(
    routeId: string,
    driverId: string,
    dto: UpdatePickupRouteStatusDto,
  ) {
    const status = dto.status;

    if (!this.isValidStatus(status)) {
      throw new BadRequestException('Status rute penjemputan tidak valid');
    }

    const route = await this.pickupRouteModel
      .findOne({ id: routeId, driver_id: driverId })
      .lean()
      .exec();

    if (!route) {
      throw new NotFoundException('Rute penjemputan tidak ditemukan');
    }

    const timestampPatch = this.getTimestampPatch(status);
    const updatedRoute = await this.pickupRouteModel
      .findOneAndUpdate(
        { id: routeId, driver_id: driverId },
        {
          status,
          ...timestampPatch,
          notes: dto.notes?.trim() || route.notes,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'pickup_route.status_updated',
      entityType: 'pickup_route',
      entityId: routeId,
      payload: {
        driver_id: driverId,
        status,
      },
    });

    return this.enrichRoute(updatedRoute!);
  }

  async updateDriverLocation(
    routeId: string,
    driverId: string,
    dto: UpdateDriverLocationDto,
  ) {
    const latitude = this.toRequiredCoordinate(dto.latitude, 'latitude');
    const longitude = this.toRequiredCoordinate(dto.longitude, 'longitude');

    const route = await this.pickupRouteModel
      .findOne({ id: routeId, driver_id: driverId })
      .lean()
      .exec();

    if (!route) {
      throw new NotFoundException('Rute penjemputan tidak ditemukan');
    }

    if (route.status === 'completed' || route.status === 'cancelled') {
      throw new BadRequestException('Lokasi tidak bisa diperbarui untuk rute selesai');
    }

    const updatedRoute = await this.pickupRouteModel
      .findOneAndUpdate(
        { id: routeId, driver_id: driverId },
        {
          driver_latitude: latitude,
          driver_longitude: longitude,
          driver_location_updated_at: new Date().toISOString(),
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    return this.enrichRoute(updatedRoute!);
  }

  private isValidStatus(status: PickupRouteStatus): boolean {
    return ['assigned', 'on_the_way', 'picked_up', 'completed', 'cancelled'].includes(
      status,
    );
  }

  private getTimestampPatch(status: PickupRouteStatus) {
    const now = new Date().toISOString();

    if (status === 'on_the_way') {
      return { started_at: now };
    }

    if (status === 'picked_up') {
      return { picked_up_at: now };
    }

    if (status === 'completed' || status === 'cancelled') {
      return { completed_at: now };
    }

    return {};
  }

  private toRequiredCoordinate(value: number, fieldName: string): number {
    const coordinate = Number(value);

    if (!Number.isFinite(coordinate)) {
      throw new BadRequestException(`${fieldName} tidak valid`);
    }

    return coordinate;
  }

  private async enrichRoute(route: PickupRouteEntity) {
    const [submission, user, driver, dropPoint] = await Promise.all([
      this.submissionModel
        .findOne({ id: route.submission_id })
        .select({ _id: 0, __v: 0 })
        .lean()
        .exec(),
      this.userModel
        .findOne({ id: route.user_id })
        .select({ _id: 0, __v: 0, password_hash: 0 })
        .lean()
        .exec(),
      this.userModel
        .findOne({ id: route.driver_id })
        .select({ _id: 0, __v: 0, password_hash: 0 })
        .lean()
        .exec(),
      route.drop_point_id
        ? this.dropPointModel
            .findOne({ id: route.drop_point_id })
            .select({ _id: 0, __v: 0 })
            .lean()
            .exec()
        : Promise.resolve(null),
    ]);

    return {
      ...route,
      user_name: user?.business_name || user?.full_name || '-',
      user_email: user?.email || '-',
      driver_name: driver?.full_name || '-',
      driver_email: driver?.email || '-',
      driver_vehicle: driver?.vehicle_number,
      drop_point: dropPoint,
      drop_point_name: dropPoint?.name,
      drop_point_address: dropPoint?.address,
      drop_point_latitude: dropPoint?.latitude,
      drop_point_longitude: dropPoint?.longitude,
      submission,
    };
  }
}
