import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { Transaction, WithdrawalMethod } from '../common/models';
import { TransactionEntity } from '../database/schemas/transaction.schema';
import { UserEntity } from '../database/schemas/user.schema';
import {
  ACTIVITY_JOB_LOG,
  ACTIVITY_QUEUE,
} from '../infrastructure/queues.constants';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(TransactionEntity.name)
    private readonly transactionModel: Model<TransactionEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectQueue(ACTIVITY_QUEUE)
    private readonly activityQueue: Queue,
  ) {}

  findMine(userId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ user_id: userId })
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async createWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const amount = Math.round(Number(dto.amount));
    const method = dto.method;
    const account = dto.account?.trim();

    if (!Number.isFinite(amount) || amount < 10000) {
      throw new BadRequestException('Minimal penarikan adalah Rp 10.000');
    }

    if (!this.isValidMethod(method)) {
      throw new BadRequestException('Metode penarikan tidak didukung');
    }

    if (!account) {
      throw new BadRequestException('Akun tujuan wajib diisi');
    }

    const balance = await this.getAvailableBalance(userId);

    if (amount > balance) {
      throw new BadRequestException('Saldo tidak mencukupi');
    }

    const createdTransaction = await this.transactionModel.create({
      id: `trx-${randomUUID()}`,
      user_id: userId,
      type: 'withdrawal',
      amount,
      status: 'pending',
      created_at: new Date().toISOString(),
      withdrawal_method: method,
      withdrawal_account: account,
      notes: 'Mode demo - menunggu persetujuan admin',
    });

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'withdrawal.created',
      entityType: 'transaction',
      entityId: createdTransaction.id,
      payload: {
        user_id: userId,
        amount,
        method,
        mode: 'demo',
      },
    });

    return this.transactionModel
      .findOne({ id: createdTransaction.id })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();
  }

  async findAllWithdrawals() {
    const requests = await this.transactionModel
      .find({ type: 'withdrawal' })
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();

    const userIds = [...new Set(requests.map((request) => request.user_id))];
    const users = await this.userModel
      .find({ id: { $in: userIds } })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    const userMap = new Map(users.map((user) => [user.id, user]));

    const mappedRequests = requests.map((transaction) => {
      const user = userMap.get(transaction.user_id);

      return {
        id: transaction.id,
        user_id: transaction.user_id,
        user_email: user?.email ?? '-',
        user_name: user?.business_name ?? user?.full_name ?? '-',
        amount: transaction.amount,
        method: this.toDisplayMethod(transaction.withdrawal_method),
        account: transaction.withdrawal_account ?? '-',
        status: transaction.status,
        created_at: transaction.created_at,
        completed_at: transaction.completed_at,
        notes: transaction.notes,
      };
    });

    return {
      pending: mappedRequests.filter((request) => request.status === 'pending'),
      processed: mappedRequests.filter((request) => request.status !== 'pending'),
    };
  }

  async approveWithdrawal(id: string, adminId: string) {
    const transaction = await this.findWithdrawalOrFail(id);

    if (transaction.status !== 'pending') {
      throw new BadRequestException('Hanya withdrawal pending yang bisa disetujui');
    }

    const updatedTransaction = await this.transactionModel
      .findOneAndUpdate(
        { id },
        {
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: `Simulasi penarikan disetujui oleh ${adminId}. Tidak ada transfer third-party.`,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'withdrawal.approved',
      entityType: 'transaction',
      entityId: id,
      payload: {
        admin_id: adminId,
        mode: 'demo',
      },
    });

    return updatedTransaction;
  }

  async rejectWithdrawal(id: string, dto: RejectWithdrawalDto, adminId: string) {
    const reason = dto.reason?.trim();

    if (!reason) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }

    const transaction = await this.findWithdrawalOrFail(id);

    if (transaction.status !== 'pending') {
      throw new BadRequestException('Hanya withdrawal pending yang bisa ditolak');
    }

    const updatedTransaction = await this.transactionModel
      .findOneAndUpdate(
        { id },
        {
          status: 'rejected',
          completed_at: new Date().toISOString(),
          notes: `Simulasi ditolak: ${reason} (diproses oleh ${adminId})`,
        },
        { new: true },
      )
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    await this.activityQueue.add(ACTIVITY_JOB_LOG, {
      event: 'withdrawal.rejected',
      entityType: 'transaction',
      entityId: id,
      payload: {
        admin_id: adminId,
        reason,
        mode: 'demo',
      },
    });

    return updatedTransaction;
  }

  async getAvailableBalance(userId: string): Promise<number> {
    const transactions = await this.findMine(userId);

    const deposits = transactions
      .filter((transaction) => transaction.type === 'deposit' && transaction.status === 'completed')
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const reservedOrPaidWithdrawals = transactions
      .filter(
        (transaction) =>
          transaction.type === 'withdrawal' &&
          (transaction.status === 'pending' || transaction.status === 'completed'),
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return deposits - reservedOrPaidWithdrawals;
  }

  private async findWithdrawalOrFail(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel
      .findOne({ id, type: 'withdrawal' })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    if (!transaction) {
      throw new NotFoundException(`Withdrawal dengan id "${id}" tidak ditemukan`);
    }

    return transaction;
  }

  private isValidMethod(method: WithdrawalMethod): boolean {
    return method === 'gopay' || method === 'ovo' || method === 'dana' || method === 'bank';
  }

  private toDisplayMethod(method?: WithdrawalMethod): string {
    if (method === 'bank') {
      return 'Bank Transfer';
    }

    return method ? method.toUpperCase() : '-';
  }
}
