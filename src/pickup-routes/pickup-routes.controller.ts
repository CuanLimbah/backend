import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';
import { Roles } from '../common/roles.decorator';
import { AssignPickupRouteDto } from './dto/assign-pickup-route.dto';
import { UpdatePickupRouteStatusDto } from './dto/update-pickup-route-status.dto';
import { PickupRoutesService } from './pickup-routes.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class PickupRoutesController {
  constructor(private readonly pickupRoutesService: PickupRoutesService) {}

  @Get('admin/pickup-routes')
  @Roles('admin')
  findAll() {
    return this.pickupRoutesService.findAll();
  }

  @Post('admin/pickup-routes')
  @Roles('admin')
  assign(@Body() dto: AssignPickupRouteDto, @CurrentUser() user: PublicUser) {
    return this.pickupRoutesService.assign(dto, user.id);
  }

  @Get('pickup-routes/me')
  @Roles('user')
  findMine(@CurrentUser() user: PublicUser) {
    return this.pickupRoutesService.findForUser(user.id);
  }

  @Get('driver/pickup-routes')
  @Roles('driver')
  findForDriver(@CurrentUser() user: PublicUser) {
    return this.pickupRoutesService.findForDriver(user.id);
  }

  @Patch('driver/pickup-routes/:id/status')
  @Roles('driver')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePickupRouteStatusDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.pickupRoutesService.updateStatus(id, user.id, dto);
  }
}
