import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityEventEntity } from '../database/schemas/activity-event.schema';
import { ACTIVITY_JOB_LOG, ACTIVITY_QUEUE } from './queues.constants';

type ActivityJobPayload = {
  event: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

@Processor(ACTIVITY_QUEUE)
@Injectable()
export class ActivityProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityProcessor.name);

  constructor(
    @InjectModel(ActivityEventEntity.name)
    private readonly activityEventModel: Model<ActivityEventEntity>,
  ) {
    super();
  }

  async process(job: Job<ActivityJobPayload>): Promise<void> {
    if (job.name !== ACTIVITY_JOB_LOG) {
      this.logger.warn(`Unknown activity job received: ${job.name}`);
      return;
    }

    await this.activityEventModel.create({
      id: `evt-${randomUUID()}`,
      event: job.data.event,
      entity_type: job.data.entityType,
      entity_id: job.data.entityId,
      payload: job.data.payload,
      created_at: new Date().toISOString(),
    });
  }
}
