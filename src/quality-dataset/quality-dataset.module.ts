import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QualityCaseDatasetService } from './quality-case-dataset.service';
import { QualityDatasetController } from './quality-dataset.controller';

@Module({
  imports: [AuthModule],
  controllers: [QualityDatasetController],
  providers: [QualityCaseDatasetService],
  exports: [QualityCaseDatasetService],
})
export class QualityDatasetModule {}
