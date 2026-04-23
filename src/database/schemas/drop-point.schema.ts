import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type { DropPoint } from '../../common/models';

type GeoPoint = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({
  collection: 'drop_points',
  id: false,
  versionKey: false,
})
export class DropPointEntity implements DropPoint {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;

  @Prop({ required: true })
  operating_hours: string;

  @Prop({ required: true })
  contact: string;

  @Prop({
    required: true,
    type: new MongooseSchema(
      {
        type: {
          type: String,
          enum: ['Point'],
          required: true,
        },
        coordinates: {
          type: [Number],
          required: true,
        },
      },
      { _id: false },
    ),
  })
  location: GeoPoint;
}

export const DropPointSchema = SchemaFactory.createForClass(DropPointEntity);

DropPointSchema.index({ location: '2dsphere' });

DropPointSchema.pre('validate', function populateLocation() {
  const latitude = this.get('latitude') as number;
  const longitude = this.get('longitude') as number;

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    this.set('location', {
      type: 'Point',
      coordinates: [longitude, latitude],
    } satisfies GeoPoint);
  }
});
