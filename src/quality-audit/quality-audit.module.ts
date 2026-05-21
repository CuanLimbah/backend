import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QualityAuditController } from './quality-audit.controller';
import { QualityAuditLogService } from './quality-audit-log.service';

@Module({
  imports: [AuthModule],
  controllers: [QualityAuditController],
  providers: [QualityAuditLogService],
  exports: [QualityAuditLogService],
})
export class QualityAuditModule {}
