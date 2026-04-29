import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PickupRoutesController } from './pickup-routes.controller';
import { PickupRoutesService } from './pickup-routes.service';

@Module({
  imports: [AuthModule],
  controllers: [PickupRoutesController],
  providers: [PickupRoutesService],
  exports: [PickupRoutesService],
})
export class PickupRoutesModule {}
