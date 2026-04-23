import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WasteSubmissionEntity } from '../database/schemas/submission.schema';
import { CloudinaryService } from './cloudinary.service';
import { MEDIA_JOB_UPLOAD_SUBMISSION_IMAGE, MEDIA_QUEUE } from './queues.constants';

type SubmissionImageJobPayload = {
  submissionId: string;
};

@Processor(MEDIA_QUEUE)
@Injectable()
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    @InjectModel(WasteSubmissionEntity.name)
    private readonly submissionModel: Model<WasteSubmissionEntity>,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    super();
  }

  async process(job: Job<SubmissionImageJobPayload>): Promise<void> {
    if (job.name !== MEDIA_JOB_UPLOAD_SUBMISSION_IMAGE) {
      this.logger.warn(`Unknown media job received: ${job.name}`);
      return;
    }

    const submission = await this.submissionModel
      .findOne({ id: job.data.submissionId })
      .exec();

    if (!submission?.image_url || !this.cloudinaryService.isDataUrl(submission.image_url)) {
      return;
    }

    if (!this.cloudinaryService.isConfigured()) {
      await this.submissionModel.updateOne(
        { id: submission.id },
        {
          storage_provider: 'inline',
          storage_status: 'ready',
        },
      );
      return;
    }

    const uploaded = await this.cloudinaryService.uploadSubmissionImage(
      submission.image_url,
      submission.id,
    );

    await this.submissionModel.updateOne(
      { id: submission.id },
      {
        image_url: uploaded.secureUrl,
        cloudinary_public_id: uploaded.publicId,
        storage_provider: 'cloudinary',
        storage_status: 'ready',
      },
    );
  }
}
