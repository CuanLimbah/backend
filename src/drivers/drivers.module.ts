import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PickupRoutesModule } from '../pickup-routes/pickup-routes.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [AuthModule, PickupRoutesModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
