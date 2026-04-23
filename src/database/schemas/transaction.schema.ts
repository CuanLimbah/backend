import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Transaction } from '../../common/models';

@Schema({
  collection: 'transactions',
  id: false,
  versionKey: false,
})
export class TransactionEntity implements Transaction {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  user_id: string;

  @Prop({ required: true, enum: ['deposit', 'withdrawal'], index: true })
  type: 'deposit' | 'withdrawal';

  @Prop({ required: true })
  amount: number;

  @Prop({
    required: true,
    enum: ['pending', 'completed', 'rejected'],
    index: true,
  })
  status: 'pending' | 'completed' | 'rejected';

  @Prop({ required: true, index: true })
  created_at: string;

  @Prop()
  completed_at?: string;

  @Prop()
  submission_id?: string;

  @Prop({ enum: ['gopay', 'ovo', 'dana', 'bank'] })
  withdrawal_method?: 'gopay' | 'ovo' | 'dana' | 'bank';

  @Prop()
  withdrawal_account?: string;

  @Prop()
  notes?: string;
}

export const TransactionSchema = SchemaFactory.createForClass(TransactionEntity);
