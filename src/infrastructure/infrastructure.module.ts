import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { ActivityProcessor } from './activity.processor';
import { CloudinaryService } from './cloudinary.service';
import { MapsService } from './maps.service';
import { MediaProcessor } from './media.processor';
import { ACTIVITY_QUEUE, MEDIA_QUEUE } from './queues.constants';

@Global()
@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue(
      { name: ACTIVITY_QUEUE },
      { name: MEDIA_QUEUE },
    ),
  ],
  providers: [
    CloudinaryService,
    MapsService,
    ActivityProcessor,
    MediaProcessor,
  ],
  exports: [BullModule, CloudinaryService, MapsService],
})
export class InfrastructureModule {}
