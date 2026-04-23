import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { WasteSubmission } from '../../common/models';

type StorageProvider = 'inline' | 'cloudinary';
type StorageStatus = 'pending' | 'ready' | 'failed';

@Schema({
  collection: 'submissions',
  id: false,
  versionKey: false,
})
export class WasteSubmissionEntity implements WasteSubmission {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true, enum: ['food', 'oil'], index: true })
  waste_type: 'food' | 'oil';

  @Prop({ required: true })
  estimated_weight: number;

  @Prop()
  actual_weight?: number;

  @Prop()
  image_url?: string;

  @Prop({
    required: true,
    enum: ['pending', 'verified', 'completed', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'verified' | 'completed' | 'rejected';

  @Prop({ required: true, index: true })
  created_at: string;

  @Prop()
  verified_at?: string;

  @Prop()
  completed_at?: string;

  @Prop()
  notes?: string;

  @Prop()
  earnings?: number;

  @Prop({ enum: ['inline', 'cloudinary'] satisfies StorageProvider[], default: 'inline' })
  storage_provider?: StorageProvider;

  @Prop({ enum: ['pending', 'ready', 'failed'] satisfies StorageStatus[], default: 'ready' })
  storage_status?: StorageStatus;

  @Prop()
  cloudinary_public_id?: string;
}

export const WasteSubmissionSchema =
  SchemaFactory.createForClass(WasteSubmissionEntity);
