import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { WastePrice } from '../../common/models';

@Schema({
  collection: 'prices',
  id: false,
  versionKey: false,
})
export class WastePriceEntity implements WastePrice {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, enum: ['food', 'oil'], unique: true, index: true })
  waste_type: 'food' | 'oil';

  @Prop({ required: true })
  price_per_kg: number;

  @Prop({ required: true })
  updated_at: string;

  @Prop({ required: true })
  updated_by: string;
}

export const WastePriceSchema = SchemaFactory.createForClass(WastePriceEntity);
