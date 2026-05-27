import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminStats, WasteType } from '../common/models';
import { toPublicUser } from '../common/utils';
import { DropPointEntity } from '../database/schemas/drop-point.schema';
import { PaymentEntity } from '../database/schemas/payment.schema';
import { PickupRouteEntity } from '../database/schemas/pickup-route.schema';
import { WastePriceEntity } from '../database/schemas/price.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { TransactionEntity } from '../database/schemas/transaction.schema';
import { UserEntity } from '../database/schemas/user.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    @InjectModel(TransactionEntity.name)
    private readonly transactionModel: Model<TransactionEntity>,
    @InjectModel(WastePriceEntity.name)
    private readonly priceModel: Model<WastePriceEntity>,
    @InjectModel(PickupRouteEntity.name)
    private readonly pickupRouteModel: Model<PickupRouteEntity>,
    @InjectModel(PaymentEntity.name)
    private readonly paymentModel: Model<PaymentEntity>,
    @InjectModel(DropPointEntity.name)
    private readonly dropPointModel: Model<DropPointEntity>,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async getDashboard() {
    const [
      stats,
      prices,
      dropPoints,
      pendingSubmissions,
      assignableSubmissions,
      users,
      drivers,
      pickupRoutes,
      payments,
      withdrawals,
    ] =
      await Promise.all([
        this.getStats(),
        this.priceModel.find().select({ _id: 0, __v: 0 }).sort({ waste_type: 1 }).lean().exec(),
        this.dropPointModel.find().select({ _id: 0, __v: 0 }).sort({ name: 1 }).lean().exec(),
        this.submissionModel
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
          .exec(),
        this.submissionModel
          .find({ status: 'completed' })
          .select({
            _id: 0,
            __v: 0,
            storage_provider: 0,
            storage_status: 0,
            cloudinary_public_id: 0,
          })
          .sort({ verified_at: -1, completed_at: -1, created_at: -1 })
          .lean()
          .exec(),
        this.getUsers(),
        this.getDrivers(),
        this.pickupRouteModel.find().select({ _id: 0, __v: 0 }).sort({ scheduled_at: -1 }).lean().exec(),
        this.paymentModel.find().select({ _id: 0, __v: 0 }).sort({ created_at: -1 }).lean().exec(),
        this.transactionsService.findAllWithdrawals(),
      ]);

    return {
      stats,
      prices,
      drop_points: dropPoints,
      pending_submissions: pendingSubmissions,
      assignable_submissions: assignableSubmissions,
      users,
      drivers,
      pickup_routes: pickupRoutes,
      payments,
      withdrawals,
    };
  }

  async getDrivers() {
    const drivers = await this.userModel
      .find({ role: 'driver' })
      .select({ _id: 0, __v: 0 })
      .sort({ created_at: -1 })
      .lean()
      .exec();

    return drivers.map((driver) => toPublicUser(driver));
  }

  async getUsers(search?: string) {
    const query = search?.trim().toLowerCase();
    const users = await this.userModel
      .find({ role: 'user' })
      .select({ _id: 0, __v: 0 })
      .lean()
      .exec();

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const stats = await this.usersService.getUserStats(user.id);

        return {
          ...toPublicUser(user),
          display_name: user.business_name ?? user.full_name,
          total_submissions: stats.total_submissions,
          total_weight: stats.total_weight,
          total_earnings: stats.total_earnings,
          joined_at: user.created_at,
        };
      }),
    );

    return usersWithStats
      .filter((user) => {
        if (!query) {
          return true;
        }

        return (
          user.email.toLowerCase().includes(query) ||
          user.display_name.toLowerCase().includes(query) ||
          user.full_name.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => right.joined_at.localeCompare(left.joined_at));
  }

  async getStats(): Promise<AdminStats> {
    const [users, completedSubmissions, completedDeposits, pendingWithdrawals] =
      await Promise.all([
        this.userModel.find({ role: 'user' }).select({ _id: 0, __v: 0 }).lean().exec(),
        this.submissionModel
          .find({ status: 'completed' })
          .select({ _id: 0, __v: 0 })
          .lean()
          .exec(),
        this.transactionModel
          .find({ type: 'deposit', status: 'completed' })
          .select({ _id: 0, __v: 0 })
          .lean()
          .exec(),
        this.transactionModel
          .find({ type: 'withdrawal', status: 'pending' })
          .select({ _id: 0, __v: 0 })
          .lean()
          .exec(),
      ]);

    const wasteByType = this.buildWasteByType(completedSubmissions);

    return {
      total_users: users.length,
      total_waste_collected: Number(
        completedSubmissions
          .reduce((sum, submission) => sum + (submission.actual_weight ?? 0), 0)
          .toFixed(1),
      ),
      total_cuan_distributed: completedDeposits.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
      pending_verifications: await this.submissionModel.countDocuments({ status: 'pending' }).exec(),
      pending_withdrawals: pendingWithdrawals.length,
      user_growth: this.buildUserGrowth(users),
      waste_by_type: wasteByType,
    };
  }

  private buildWasteByType(
    completedSubmissions: WasteSubmissionEntity[],
  ): Array<{ type: WasteType; weight: number }> {
    return (['food', 'oil'] as WasteType[]).map((type) => ({
      type,
      weight: Number(
        completedSubmissions
          .filter((submission) => submission.waste_type === type)
          .reduce((sum, submission) => sum + (submission.actual_weight ?? 0), 0)
          .toFixed(1),
      ),
    }));
  }

  private buildUserGrowth(users: UserEntity[]): Array<{ date: string; users: number }> {
    const sortedUsers = [...users].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    );

    const snapshots: Array<{ date: string; users: number }> = [];
    const start = new Date();
    start.setDate(start.getDate() - 28);
    start.setHours(0, 0, 0, 0);

    for (let index = 0; index < 5; index += 1) {
      const snapshotDate = new Date(start);
      snapshotDate.setDate(start.getDate() + index * 7);

      const userCount = sortedUsers.filter(
        (user) => new Date(user.created_at).getTime() <= snapshotDate.getTime(),
      ).length;

      snapshots.push({
        date: snapshotDate.toISOString(),
        users: userCount,
      });
    }

    return snapshots;
  }
}
