import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PricesService } from './prices.service';
import { UpdatePriceDto } from './dto/update-price.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';

@Controller()
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get('prices')
  findAll() {
    return this.pricesService.findAll();
  }

  @Patch('admin/prices/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.pricesService.update(id, Number(dto.pricePerKg), user.id);
  }
}
