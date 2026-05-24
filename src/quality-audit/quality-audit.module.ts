import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QualityDatasetModule } from '../quality-dataset/quality-dataset.module';
import { QualityAuditController } from './quality-audit.controller';
import { QualityAuditLogService } from './quality-audit-log.service';

@Module({
  imports: [AuthModule, QualityDatasetModule],
  controllers: [QualityAuditController],
  providers: [QualityAuditLogService],
  exports: [QualityAuditLogService],
})
export class QualityAuditModule {}
