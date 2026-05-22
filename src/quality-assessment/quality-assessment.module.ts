import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QualityAuditModule } from '../quality-audit/quality-audit.module';
import { QualityDatasetModule } from '../quality-dataset/quality-dataset.module';
import { QualityAssessmentController } from './quality-assessment.controller';
import { QualityAssessmentService } from './quality-assessment.service';
import { QualityRagService } from './quality-rag.service';
import { QualityVisionService } from './quality-vision.service';

@Module({
  imports: [AuthModule, QualityAuditModule, QualityDatasetModule],
  controllers: [QualityAssessmentController],
  providers: [QualityAssessmentService, QualityRagService, QualityVisionService],
  exports: [QualityAssessmentService, QualityRagService, QualityVisionService],
})
export class QualityAssessmentModule {}
