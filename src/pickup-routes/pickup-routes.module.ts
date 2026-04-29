import { Module } from '@nestjs/common';
import { PickupRoutesController } from './pickup-routes.controller';
import { PickupRoutesService } from './pickup-routes.service';

@Module({
  controllers: [PickupRoutesController],
  providers: [PickupRoutesService],
  exports: [PickupRoutesService],
})
export class PickupRoutesModule {}
