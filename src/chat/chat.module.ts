import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { QualityAuditModule } from '../quality-audit/quality-audit.module';
import { QualityDatasetModule } from '../quality-dataset/quality-dataset.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, PricingModule, QualityAuditModule, QualityDatasetModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
