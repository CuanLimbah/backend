import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type { PickupRouteStatus } from '../common/models';
import { PickupRouteEntity } from '../database/schemas/pickup-route.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { UserEntity } from '../database/schemas/user.schema';
import {
  ACTIVITY_JOB_LOG,
  ACTIVITY_QUEUE,
} from '../infrastructure/queues.constants';
import { AssignPickupRouteDto } from './dto/assign-pickup-route.dto';
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
    @InjectQueue(ACTIVITY_QUEUE)
    private readonly activityQueue: Queue,
  ) {}

  async assign(dto: AssignPickupRouteDto, adminId: string) {
    const submissionId = dto.submissionId?.trim();
    const driverId = dto.driverId?.trim();

    if (!submissionId || !driverId) {
      throw new BadRequestException('submissionId dan driverId wajib diisi');
    }

    const [submission, driver, existingRoute] = await Promise.all([
      this.submissionModel.findOne({ id: submissionId }).lean().exec(),
      this.userModel
        .findOne({ id: driverId, role: 'driver', status: 'active' })
        .lean()
        .exec(),
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
      address: dto.address?.trim() || undefined,
      latitude: this.toOptionalCoordinate(dto.latitude),
      longitude: this.toOptionalCoordinate(dto.longitude),
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

  private toOptionalCoordinate(value?: number): number | undefined {
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : undefined;
  }

  private async enrichRoute(route: PickupRouteEntity) {
    const [submission, user, driver] = await Promise.all([
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
    ]);

    return {
      ...route,
      user_name: user?.business_name || user?.full_name || '-',
      user_email: user?.email || '-',
      driver_name: driver?.full_name || '-',
      driver_email: driver?.email || '-',
      driver_vehicle: driver?.vehicle_number,
      submission,
    };
  }
}
