import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type { PaymentMethod, PaymentStatus } from '../common/models';
import { PaymentEntity } from '../database/schemas/payment.schema';
import { UserEntity } from '../database/schemas/user.schema';
import {
  ACTIVITY_JOB_LOG,
  ACTIVITY_QUEUE,
} from '../infrastructure/queues.constants';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly provider = 'midtrans';

  private readonly frontendUrl = (
    process.env.FRONTEND_URL?.trim() || 'http://localhost:5173'
  ).replace(/\/+$/, '');

  private readonly midtransServerKey = process.env.MIDTRANS_SERVER_KEY?.trim();

  private readonly midtransIsProduction =
    process.env.MIDTRANS_IS_PRODUCTION?.trim().toLowerCase() === 'true';

  constructor(
    @InjectModel(PaymentEntity.name)
    private readonly paymentModel: Model<PaymentEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectQueue(ACTIVITY_QUEUE)
    private readonly activityQueue: Queue,
  ) {}

  async create(userId: string, dto: CreatePaymentDto) {
    const amount = Math.round(Number(dto.amount));
    const method = dto.method;
    const purpose = dto.purpose?.trim() || 'pickup_service';

    if (!Number.isFinite(amount) || amount < 10000) {
      throw new BadRequestException('Minimal pembayaran adalah Rp 10.000');
    }

    if (!this.isValidMethod(method)) {
      throw new BadRequestException('Metode pembayaran tidak didukung');
    }

    const paymentId = `pay-${randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 24);
    const checkout = await this.createMidtransTransaction({
      paymentId,
      userId,
      amount,
      method,
      purpose,
    });

    const createdPayment = await this.paymentModel.create({
      id: paymentId,
      user_id: userId,
      amount,
      method,
      status: 'pending',
      provider: this.provider,
      purpose,
      checkout_url: checkout.redirectUrl,
      external_reference: checkout.token,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      notes: dto.notes?.trim() || undefined,
    });

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'payment.created',
      entityType: 'payment',
      entityId: paymentId,
      payload: {
        user_id: userId,
        amount,
        method,
        provider: this.provider,
      },
    });

    return this.findByIdOrFail(createdPayment.id);
  }

  async handleMidtransNotification(payload: Record<string, unknown>) {
    const orderId = this.getString(payload.order_id);
    const transactionStatus = this.getString(payload.transaction_status);
    const fraudStatus = this.getString(payload.fraud_status);
    const statusCode = this.getString(payload.status_code);
    const grossAmount = this.getString(payload.gross_amount);
    const signatureKey = this.getString(payload.signature_key);

    if (!orderId || !transactionStatus) {
      throw new BadRequestException('Payload notification Midtrans tidak valid');
    }

    if (
      this.midtransServerKey &&
      signatureKey &&
      !this.isValidMidtransSignature({
        orderId,
        statusCode,
        grossAmount,
        signatureKey,
      })
    ) {
      throw new BadRequestException('Signature Midtrans tidak valid');
    }

    const payment = await this.findByIdOrFail(orderId);
    const status = this.mapMidtransStatus(transactionStatus, fraudStatus);
    const paidAt = status === 'paid' ? new Date().toISOString() : payment.paid_at;

    const updatedPayment = await this.paymentModel
      .findOneAndUpdate(
        { id: orderId },
        {
          status,
          paid_at: paidAt,
          notes: `Midtrans ${transactionStatus}${fraudStatus ? ` (${fraudStatus})` : ''}`,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'payment.midtrans_notification',
      entityType: 'payment',
      entityId: orderId,
      payload: {
        status,
        transaction_status: transactionStatus,
        fraud_status: fraudStatus,
      },
    });

    return updatedPayment;
  }

  findMine(userId: string) {
    return this.paymentModel
      .find({ user_id: userId })
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  findAll() {
    return this.paymentModel
      .find()
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async markPaid(id: string, adminId: string) {
    const payment = await this.findByIdOrFail(id);

    if (payment.status !== 'pending') {
      throw new BadRequestException('Hanya pembayaran pending yang bisa ditandai lunas');
    }

    const updatedPayment = await this.paymentModel
      .findOneAndUpdate(
        { id },
        {
          status: 'paid',
          paid_at: new Date().toISOString(),
          notes: `Dikonfirmasi oleh ${adminId}`,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'payment.paid',
      entityType: 'payment',
      entityId: id,
      payload: {
        admin_id: adminId,
      },
    });

    return updatedPayment;
  }

  private async findByIdOrFail(id: string) {
    const payment = await this.paymentModel
      .findOne({ id })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!payment) {
      throw new NotFoundException(`Pembayaran dengan id "${id}" tidak ditemukan`);
    }

    return payment;
  }

  private isValidMethod(method: PaymentMethod): boolean {
    return method === 'qris' || method === 'virtual_account' || method === 'ewallet';
  }

  private async createMidtransTransaction(input: {
    paymentId: string;
    userId: string;
    amount: number;
    method: PaymentMethod;
    purpose: string;
  }) {
    if (!this.midtransServerKey) {
      throw new BadRequestException('MIDTRANS_SERVER_KEY belum dikonfigurasi');
    }

    const user = await this.userModel
      .findOne({ id: input.userId })
      .select({ _id: 0, __v: 0, password_hash: 0 })
      .lean()
      .exec();
    const [firstName, ...lastNameParts] = (user?.full_name || 'User CuanLimbah')
      .trim()
      .split(/\s+/);
    const baseUrl = this.midtransIsProduction
      ? 'https://app.midtrans.com'
      : 'https://app.sandbox.midtrans.com';

    const response = await fetch(`${baseUrl}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: this.getMidtransAuthorizationHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.paymentId,
          gross_amount: input.amount,
        },
        item_details: [
          {
            id: input.purpose,
            price: input.amount,
            quantity: 1,
            name: this.getPurposeLabel(input.purpose),
          },
        ],
        customer_details: {
          first_name: firstName,
          last_name: lastNameParts.join(' ') || undefined,
          email: user?.email,
          phone: user?.phone_number,
        },
        enabled_payments: this.getEnabledPayments(input.method),
        callbacks: {
          finish: `${this.frontendUrl}/dashboard?paymentId=${encodeURIComponent(input.paymentId)}`,
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { token?: string; redirect_url?: string; error_messages?: string[] }
      | null;

    if (!response.ok || !data?.token || !data.redirect_url) {
      throw new BadRequestException(
        data?.error_messages?.join(', ') || 'Gagal membuat transaksi Midtrans',
      );
    }

    return {
      token: data.token,
      redirectUrl: data.redirect_url,
    };
  }

  private getMidtransAuthorizationHeader(): string {
    const credential = Buffer.from(`${this.midtransServerKey}:`).toString('base64');
    return `Basic ${credential}`;
  }

  private getEnabledPayments(method: PaymentMethod): string[] {
    if (method === 'qris') {
      return ['qris'];
    }

    if (method === 'ewallet') {
      return ['gopay', 'shopeepay'];
    }

    return ['bank_transfer', 'bca_va', 'bni_va', 'bri_va', 'permata_va'];
  }

  private getPurposeLabel(purpose: string): string {
    if (purpose === 'pickup_service') {
      return 'Biaya layanan penjemputan CuanLimbah';
    }

    if (purpose === 'subscription') {
      return 'Langganan layanan UMKM CuanLimbah';
    }

    return 'Pembayaran CuanLimbah';
  }

  private mapMidtransStatus(
    transactionStatus: string,
    fraudStatus?: string,
  ): PaymentStatus {
    if (transactionStatus === 'capture') {
      return fraudStatus === 'challenge' ? 'pending' : 'paid';
    }

    if (transactionStatus === 'settlement') {
      return 'paid';
    }

    if (transactionStatus === 'expire') {
      return 'expired';
    }

    if (['deny', 'cancel', 'failure'].includes(transactionStatus)) {
      return 'failed';
    }

    return 'pending';
  }

  private isValidMidtransSignature(input: {
    orderId: string;
    statusCode: string;
    grossAmount: string;
    signatureKey: string;
  }): boolean {
    const expected = createHash('sha512')
      .update(
        `${input.orderId}${input.statusCode}${input.grossAmount}${this.midtransServerKey}`,
      )
      .digest('hex');

    return expected === input.signatureKey;
  }

  private getString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
