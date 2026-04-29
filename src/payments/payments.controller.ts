import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';
import { Roles } from '../common/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('user')
  create(@CurrentUser() user: PublicUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.id, dto);
  }

  @Get('payments/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('user')
  findMine(@CurrentUser() user: PublicUser) {
    return this.paymentsService.findMine(user.id);
  }

  @Post('payments/midtrans/notification')
  handleMidtransNotification(@Body() body: Record<string, unknown>) {
    return this.paymentsService.handleMidtransNotification(body);
  }

  @Get('admin/payments')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  findAll() {
    return this.paymentsService.findAll();
  }

  @Patch('admin/payments/:id/mark-paid')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  markPaid(@Param('id') id: string, @CurrentUser() user: PublicUser) {
    return this.paymentsService.markPaid(id, user.id);
  }
}
