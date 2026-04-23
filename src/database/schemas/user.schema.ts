import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { UserRecord } from '../../common/models';

@Schema({
  collection: 'users',
  id: false,
  versionKey: false,
})
export class UserEntity implements UserRecord {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true, trim: true })
  full_name: string;

  @Prop({ trim: true })
  business_name?: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop({ required: true, enum: ['admin', 'user'] })
  role: 'admin' | 'user';

  @Prop({ required: true, enum: ['active', 'inactive'], default: 'active' })
  status: 'active' | 'inactive';

  @Prop({ required: true })
  created_at: string;

  @Prop()
  avatar_url?: string;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
