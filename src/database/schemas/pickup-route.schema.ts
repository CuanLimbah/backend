import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { PickupRoute, PickupRouteStatus } from '../../common/models';

@Schema({
  collection: 'pickup_routes',
  id: false,
  versionKey: false,
})
export class PickupRouteEntity implements PickupRoute {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  submission_id: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true, index: true })
  driver_id: string;

  @Prop({ index: true })
  drop_point_id?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop()
  driver_latitude?: number;

  @Prop()
  driver_longitude?: number;

  @Prop()
  driver_location_updated_at?: string;

  @Prop({ required: true, index: true })
  scheduled_at: string;

  @Prop({
    required: true,
    enum: ['assigned', 'on_the_way', 'picked_up', 'completed', 'cancelled'],
    default: 'assigned',
    index: true,
  })
  status: PickupRouteStatus;

  @Prop({ required: true, index: true })
  created_at: string;

  @Prop()
  started_at?: string;

  @Prop()
  picked_up_at?: string;

  @Prop()
  completed_at?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const PickupRouteSchema = SchemaFactory.createForClass(PickupRouteEntity);
