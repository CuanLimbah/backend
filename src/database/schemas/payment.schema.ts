import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { PaymentMethod, PaymentRecord, PaymentStatus } from '../../common/models';

@Schema({
  collection: 'payments',
  id: false,
  versionKey: false,
})
export class PaymentEntity implements PaymentRecord {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: ['qris', 'virtual_account', 'ewallet'] })
  method: PaymentMethod;

  @Prop({
    required: true,
    enum: ['pending', 'paid', 'expired', 'failed'],
    default: 'pending',
    index: true,
  })
  status: PaymentStatus;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ required: true, trim: true })
  purpose: string;

  @Prop({ required: true, trim: true })
  checkout_url: string;

  @Prop({ trim: true })
  external_reference?: string;

  @Prop({ required: true, index: true })
  created_at: string;

  @Prop()
  paid_at?: string;

  @Prop()
  expires_at?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(PaymentEntity);
