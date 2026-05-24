import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageEmbeddingService } from './image-embedding.service';
import { QualityCaseDatasetService } from './quality-case-dataset.service';
import { QualityDatasetController } from './quality-dataset.controller';
import { SupabaseQualityVectorService } from './supabase-quality-vector.service';

@Module({
  imports: [AuthModule],
  controllers: [QualityDatasetController],
  providers: [
    QualityCaseDatasetService,
    ImageEmbeddingService,
    SupabaseQualityVectorService,
  ],
  exports: [
    QualityCaseDatasetService,
    ImageEmbeddingService,
    SupabaseQualityVectorService,
  ],
})
export class QualityDatasetModule {}
