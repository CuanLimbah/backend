import { Controller, Get, Query } from '@nestjs/common';
import { DropPointsService } from './drop-points.service';

@Controller('drop-points')
export class DropPointsController {
  constructor(private readonly dropPointsService: DropPointsService) {}

  @Get()
  findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('address') address?: string,
  ) {
    return this.dropPointsService.findAll({
      lat,
      lng,
      radiusKm,
      address,
    });
  }
}
