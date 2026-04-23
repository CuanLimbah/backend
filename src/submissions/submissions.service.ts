import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { WasteSubmission, WasteType } from '../common/models';
import { roundToOneDecimal, toCurrencyAmount } from '../common/utils';
import { WastePriceEntity } from '../database/schemas/price.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { TransactionEntity } from '../database/schemas/transaction.schema';
import { CloudinaryService } from '../infrastructure/cloudinary.service';
import {
  ACTIVITY_JOB_LOG,
  ACTIVITY_QUEUE,
  MEDIA_JOB_UPLOAD_SUBMISSION_IMAGE,
  MEDIA_QUEUE,
} from '../infrastructure/queues.constants';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { VerifySubmissionDto } from './dto/verify-submission.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    @InjectModel(WastePriceEntity.name)
    private readonly priceModel: Model<WastePriceEntity>,
    @InjectModel(TransactionEntity.name)
    private readonly transactionModel: Model<TransactionEntity>,
    @InjectQueue(ACTIVITY_QUEUE)
    private readonly activityQueue: Queue,
    @InjectQueue(MEDIA_QUEUE)
    private readonly mediaQueue: Queue,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(userId: string, dto: CreateSubmissionDto) {
    const wasteType = dto.wasteType;
    const estimatedWeight = Number(dto.estimatedWeight);
    const imageUrl = dto.imageUrl?.trim() || undefined;

    if (!this.isSupportedWasteType(wasteType)) {
      throw new BadRequestException('Jenis limbah tidak didukung');
    }

    if (!Number.isFinite(estimatedWeight) || estimatedWeight <= 0) {
      throw new BadRequestException('estimatedWeight harus lebih besar dari 0');
    }

    const submissionId = `sub-${randomUUID()}`;

    await this.submissionModel.create({
      id: submissionId,
      user_id: userId,
      waste_type: wasteType,
      estimated_weight: roundToOneDecimal(estimatedWeight),
      image_url: imageUrl,
      status: 'pending',
      created_at: new Date().toISOString(),
      storage_provider: imageUrl ? 'inline' : undefined,
      storage_status: this.cloudinaryService.isDataUrl(imageUrl) ? 'pending' : 'ready',
    });

    if (this.cloudinaryService.isDataUrl(imageUrl)) {
      await this.mediaQueue.add(
        MEDIA_JOB_UPLOAD_SUBMISSION_IMAGE,
        { submissionId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'submission.created',
      entityType: 'submission',
      entityId: submissionId,
      payload: {
        user_id: userId,
        waste_type: wasteType,
      },
    });

    const createdSubmission = await this.submissionModel
      .findOne({ id: submissionId })
      .select({
        _id: 0,
        __v: 0,
        storage_provider: 0,
        storage_status: 0,
        cloudinary_public_id: 0,
      })
      .lean()
      .exec();

    return createdSubmission;
  }

  findMine(userId: string): Promise<WasteSubmission[]> {
    return this.submissionModel
      .find({ user_id: userId })
      .select({
        _id: 0,
        __v: 0,
        storage_provider: 0,
        storage_status: 0,
        cloudinary_public_id: 0,
      })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  findPending(): Promise<WasteSubmission[]> {
    return this.submissionModel
      .find({ status: 'pending' })
      .select({
        _id: 0,
        __v: 0,
        storage_provider: 0,
        storage_status: 0,
        cloudinary_public_id: 0,
      })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async verify(id: string, dto: VerifySubmissionDto, adminId: string) {
    const actualWeight = Number(dto.actualWeight);

    if (!Number.isFinite(actualWeight) || actualWeight <= 0) {
      throw new BadRequestException('actualWeight harus lebih besar dari 0');
    }

    const submission = await this.submissionModel
      .findOne({ id })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!submission) {
      throw new NotFoundException(`Setoran dengan id "${id}" tidak ditemukan`);
    }

    if (submission.status !== 'pending') {
      throw new BadRequestException('Hanya setoran pending yang bisa diverifikasi');
    }

    const price = await this.priceModel
      .findOne({ waste_type: submission.waste_type })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!price) {
      throw new NotFoundException('Harga untuk jenis limbah ini tidak ditemukan');
    }

    const roundedActualWeight = roundToOneDecimal(actualWeight);
    const earnings = toCurrencyAmount(price.price_per_kg * roundedActualWeight);
    const processedAt = new Date().toISOString();

    const updatedSubmission = await this.submissionModel
      .findOneAndUpdate(
        { id },
        {
          actual_weight: roundedActualWeight,
          status: 'completed',
          verified_at: processedAt,
          completed_at: processedAt,
          earnings,
          notes: `Diverifikasi oleh ${adminId}`,
        },
        { new: true },
      )
      .select({
        _id: 0,
        __v: 0,
        storage_provider: 0,
        storage_status: 0,
        cloudinary_public_id: 0,
      })
      .lean()
      .exec();

    await this.transactionModel.create({
      id: `trx-${randomUUID()}`,
      user_id: submission.user_id,
      type: 'deposit',
      amount: earnings,
      status: 'completed',
      created_at: processedAt,
      completed_at: processedAt,
      submission_id: submission.id,
      notes: `Deposit dari setoran ${submission.id}`,
    });

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'submission.verified',
      entityType: 'submission',
      entityId: id,
      payload: {
        admin_id: adminId,
        actual_weight: roundedActualWeight,
        earnings,
      },
    });

    return updatedSubmission;
  }

  async reject(id: string, dto: RejectSubmissionDto, adminId: string) {
    const reason = dto.reason?.trim();

    if (!reason) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }

    const submission = await this.submissionModel
      .findOne({ id })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!submission) {
      throw new NotFoundException(`Setoran dengan id "${id}" tidak ditemukan`);
    }

    if (submission.status !== 'pending') {
      throw new BadRequestException('Hanya setoran pending yang bisa ditolak');
    }

    const updatedSubmission = await this.submissionModel
      .findOneAndUpdate(
        { id },
        {
          status: 'rejected',
          verified_at: new Date().toISOString(),
          notes: `${reason} (diproses oleh ${adminId})`,
        },
        { new: true },
      )
      .select({
        _id: 0,
        __v: 0,
        storage_provider: 0,
        storage_status: 0,
        cloudinary_public_id: 0,
      })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'submission.rejected',
      entityType: 'submission',
      entityId: id,
      payload: {
        admin_id: adminId,
        reason,
      },
    });

    return updatedSubmission;
  }

  private isSupportedWasteType(wasteType: WasteType): boolean {
    return wasteType === 'food' || wasteType === 'oil';
  }
}
