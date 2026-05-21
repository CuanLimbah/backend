import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseSeedService } from './database-seed.service';
import {
  ActivityEventEntity,
  ActivityEventSchema,
} from './schemas/activity-event.schema';
import { DropPointEntity, DropPointSchema } from './schemas/drop-point.schema';
import { PaymentEntity, PaymentSchema } from './schemas/payment.schema';
import {
  PickupRouteEntity,
  PickupRouteSchema,
} from './schemas/pickup-route.schema';
import { WastePriceEntity, WastePriceSchema } from './schemas/price.schema';
import {
  QualityAuditLogEntity,
  QualityAuditLogSchema,
} from './schemas/quality-audit-log.schema';
import {
  WasteSubmissionEntity,
  WasteSubmissionSchema,
} from './schemas/submission.schema';
import {
  TransactionEntity,
  TransactionSchema,
} from './schemas/transaction.schema';
import { UserEntity, UserSchema } from './schemas/user.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: WastePriceEntity.name, schema: WastePriceSchema },
      { name: DropPointEntity.name, schema: DropPointSchema },
      { name: PickupRouteEntity.name, schema: PickupRouteSchema },
      { name: PaymentEntity.name, schema: PaymentSchema },
      { name: WasteSubmissionEntity.name, schema: WasteSubmissionSchema },
      { name: TransactionEntity.name, schema: TransactionSchema },
      { name: ActivityEventEntity.name, schema: ActivityEventSchema },
      { name: QualityAuditLogEntity.name, schema: QualityAuditLogSchema },
    ]),
  ],
  providers: [DatabaseSeedService],
  exports: [MongooseModule],
})
export class DatabaseModule {}
