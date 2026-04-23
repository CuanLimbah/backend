import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({
  collection: 'activity_events',
  id: false,
  versionKey: false,
})
export class ActivityEventEntity {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  event: string;

  @Prop({ required: true, index: true })
  entity_type: string;

  @Prop({ required: true, index: true })
  entity_id: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  payload?: Record<string, unknown>;

  @Prop({ required: true, index: true })
  created_at: string;
}

export const ActivityEventSchema =
  SchemaFactory.createForClass(ActivityEventEntity);
