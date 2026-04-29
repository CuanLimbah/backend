import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';
import { Roles } from '../common/roles.decorator';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriversService } from './drivers.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post('admin/drivers')
  @Roles('admin')
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get('admin/drivers')
  @Roles('admin')
  findAll() {
    return this.driversService.findAll();
  }

  @Get('driver/dashboard')
  @Roles('driver')
  getDashboard(@CurrentUser() user: PublicUser) {
    return this.driversService.getDashboard(user.id);
  }
}
