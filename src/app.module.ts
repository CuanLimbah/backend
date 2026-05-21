import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { DropPointsModule } from './drop-points/drop-points.module';
import { DriversModule } from './drivers/drivers.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { PaymentsModule } from './payments/payments.module';
import { PickupRoutesModule } from './pickup-routes/pickup-routes.module';
import { QualityAuditModule } from './quality-audit/quality-audit.module';
import { QualityAssessmentModule } from './quality-assessment/quality-assessment.module';
import { buildRedisConnectionOptions } from './infrastructure/redis-connection.util';
import { PricesModule } from './prices/prices.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri:
          process.env.MONGODB_URI?.trim() ||
          'mongodb://127.0.0.1:27017/cuanlimbah',
        dbName: process.env.MONGODB_DB_NAME?.trim() || 'cuanlimbah',
      }),
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: buildRedisConnectionOptions(),
        prefix: process.env.QUEUE_PREFIX?.trim() || 'cuanlimbah',
      }),
    }),
    DatabaseModule,
    InfrastructureModule,
    ChatModule,
    AuthModule,
    DriversModule,
    PickupRoutesModule,
    PaymentsModule,
    QualityAuditModule,
    QualityAssessmentModule,
    UsersModule,
    SubmissionsModule,
    TransactionsModule,
    PricesModule,
    DropPointsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
