import { Module } from '@nestjs/common';
import { DropPointsController } from './drop-points.controller';
import { DropPointsService } from './drop-points.service';

@Module({
  controllers: [DropPointsController],
  providers: [DropPointsService],
  exports: [DropPointsService],
})
export class DropPointsModule {}
