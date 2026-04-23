import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';
import type { PublicUser } from '../common/models';

@Controller()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('transactions/me')
  @UseGuards(AuthGuard)
  findMine(@CurrentUser() user: PublicUser) {
    return this.transactionsService.findMine(user.id);
  }

  @Post('transactions/withdrawals')
  @UseGuards(AuthGuard)
  createWithdrawal(@CurrentUser() user: PublicUser, @Body() dto: CreateWithdrawalDto) {
    return this.transactionsService.createWithdrawal(user.id, dto);
  }

  @Get('admin/withdrawals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  findAllWithdrawals() {
    return this.transactionsService.findAllWithdrawals();
  }

  @Patch('admin/withdrawals/:id/approve')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  approveWithdrawal(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.transactionsService.approveWithdrawal(id, user.id);
  }

  @Patch('admin/withdrawals/:id/reject')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  rejectWithdrawal(
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.transactionsService.rejectWithdrawal(id, dto, user.id);
  }
}
