import { Module } from '@nestjs/common';
import { PickupRoutesModule } from '../pickup-routes/pickup-routes.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [PickupRoutesModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
