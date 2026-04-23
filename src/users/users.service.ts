import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PublicUser, UserStats, WasteSubmission } from '../common/models';
import { toPublicUser } from '../common/utils';
import { DropPointEntity } from '../database/schemas/drop-point.schema';
import { WastePriceEntity } from '../database/schemas/price.schema';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { UserEntity } from '../database/schemas/user.schema';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectModel(WastePriceEntity.name)
    private readonly priceModel: Model<WastePriceEntity>,
    @InjectModel(DropPointEntity.name)
    private readonly dropPointModel: Model<DropPointEntity>,
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    private readonly transactionsService: TransactionsService,
  ) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.userModel.findOne({ id: userId }).lean().exec();

    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }

    return toPublicUser(user);
  }

  async getDashboard(userId: string) {
    const [user, stats, wastePrices, submissions, transactions, dropPoints] =
      await Promise.all([
        this.getMe(userId),
        this.getUserStats(userId),
        this.priceModel.find().select({ _id: 0, __v: 0 }).sort({ waste_type: 1 }).lean().exec(),
        this.getMySubmissions(userId),
        this.transactionsService.findMine(userId),
        this.dropPointModel
          .find()
          .select({ _id: 0, __v: 0, location: 0 })
          .sort({ name: 1 })
          .lean()
          .exec(),
      ]);

    return {
      user,
      stats,
      waste_prices: wastePrices,
      submissions,
      transactions,
      drop_points: dropPoints,
    };
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const [submissions, transactions] = await Promise.all([
      this.getMySubmissions(userId),
      this.transactionsService.findMine(userId),
    ]);

    const completedSubmissions = submissions.filter(
      (submission) => submission.status === 'completed',
    );

    const totalWeight = completedSubmissions.reduce(
      (sum, submission) => sum + (submission.actual_weight ?? 0),
      0,
    );

    const totalEarnings = transactions
      .filter((transaction) => transaction.type === 'deposit' && transaction.status === 'completed')
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      total_submissions: submissions.length,
      total_weight: Number(totalWeight.toFixed(1)),
      total_earnings: totalEarnings,
      current_balance: await this.transactionsService.getAvailableBalance(userId),
      pending_submissions: submissions.filter((submission) => submission.status === 'pending')
        .length,
    };
  }

  private getMySubmissions(userId: string): Promise<WasteSubmission[]> {
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
}
