import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  QualityCaseEligibilityStatus,
  QualityGrade,
  WasteType,
} from '../common/models';
import { Roles } from '../common/roles.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { QualityCaseDatasetService } from './quality-case-dataset.service';

@Controller('admin/quality-dataset')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class QualityDatasetController {
  constructor(
    private readonly qualityCaseDatasetService: QualityCaseDatasetService,
  ) {}

  @Get('readiness')
  getReadiness(
    @Query('wasteType') wasteType?: WasteType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.qualityCaseDatasetService.getReadinessAnalytics({
      wasteType,
      startDate,
      endDate,
    });
  }

  @Get('cases')
  listCases(
    @Query('eligibilityStatus')
    eligibilityStatus?: QualityCaseEligibilityStatus,
    @Query('wasteType') wasteType?: WasteType,
    @Query('finalGrade') finalGrade?: QualityGrade,
    @Query('limit') limit?: string,
  ) {
    return this.qualityCaseDatasetService.listCases({
      eligibilityStatus,
      wasteType,
      finalGrade,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('backfill')
  backfill() {
    return this.qualityCaseDatasetService.backfillFromCompletedSubmissions();
  }

  @Post('embeddings/backfill')
  backfillEmbeddings(
    @Body('limit') bodyLimit?: number,
    @Body('force') bodyForce?: boolean,
    @Query('limit') queryLimit?: string,
    @Query('force') queryForce?: string,
  ) {
    const limit = this.parseLimit(bodyLimit ?? queryLimit, 'limit', 500);
    const force =
      bodyForce ??
      (queryForce == null ? undefined : ['true', '1', 'yes'].includes(queryForce));

    return this.qualityCaseDatasetService.backfillEmbeddingsForEligibleCases({
      limit,
      force,
    });
  }

  @Post('cases/:submissionId/embedding')
  generateCaseEmbedding(@Param('submissionId') submissionId: string) {
    return this.qualityCaseDatasetService.generateEmbeddingForCase(submissionId);
  }

  @Get('similar-cases')
  getSimilarCases(
    @Query('submissionId') submissionId: string,
    @Query('limit') limit?: string,
    @Query('minSimilarity') minSimilarity?: string,
  ) {
    if (!submissionId?.trim()) {
      throw new BadRequestException('submissionId wajib diisi');
    }

    const parsedLimit = this.parseLimit(limit, 'limit', 50);
    const parsedMinSimilarity = this.parseMinSimilarity(minSimilarity);

    return this.qualityCaseDatasetService.getSimilarCasesForSubmission(
      submissionId.trim(),
      {
        limit: parsedLimit,
        minSimilarity: parsedMinSimilarity,
      },
    );
  }

  @Post('vector/backfill')
  backfillSupabaseVectors(
    @Body('limit') bodyLimit?: number,
    @Body('force') bodyForce?: boolean,
    @Query('limit') queryLimit?: string,
    @Query('force') queryForce?: string,
  ) {
    const limit = this.parseLimit(bodyLimit ?? queryLimit, 'limit', 500);
    const force =
      bodyForce ??
      (queryForce == null ? undefined : ['true', '1', 'yes'].includes(queryForce));

    return this.qualityCaseDatasetService.backfillSupabaseVectors({
      limit,
      force,
    });
  }

  @Post('cases/:submissionId/vector-sync')
  syncCaseVector(@Param('submissionId') submissionId: string) {
    if (!submissionId?.trim()) {
      throw new BadRequestException('submissionId wajib diisi');
    }

    return this.qualityCaseDatasetService.syncCaseVectorToSupabase(
      submissionId.trim(),
    );
  }

  @Get('vector/status')
  getVectorStatus() {
    return this.qualityCaseDatasetService.getVectorSyncStatus();
  }

  @Get('vector/tuning-config')
  getVectorTuningConfig() {
    return this.qualityCaseDatasetService.getVectorTuningConfig();
  }

  @Get('vector/similar-cases')
  getVectorSimilarCases(
    @Query('submissionId') submissionId: string,
    @Query('limit') limit?: string,
    @Query('minSimilarity') minSimilarity?: string,
    @Query('provider') provider: 'supabase_pgvector' | 'application_cosine' | 'auto' = 'auto',
  ) {
    if (!submissionId?.trim()) {
      throw new BadRequestException('submissionId wajib diisi');
    }

    if (!['auto', 'supabase_pgvector', 'application_cosine'].includes(provider)) {
      throw new BadRequestException('provider tidak valid');
    }

    const parsedLimit = this.parseLimit(limit, 'limit', 50);
    const parsedMinSimilarity = this.parseMinSimilarity(minSimilarity);

    return this.qualityCaseDatasetService.getSimilarCasesForSubmissionWithProvider(
      submissionId.trim(),
      {
        limit: parsedLimit,
        minSimilarity: parsedMinSimilarity,
        provider,
      },
    );
  }

  private parseOptionalNumber(
    value: string | number | undefined,
    fieldName: string,
  ): number | undefined {
    if (value == null || value === '') return undefined;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`${fieldName} harus berupa angka`);
    }
    return parsed;
  }

  private parseLimit(
    value: string | number | undefined,
    fieldName = 'limit',
    max = 50,
  ): number | undefined {
    const parsed = this.parseOptionalNumber(value, fieldName);
    if (parsed == null) return undefined;
    if (parsed < 1 || parsed > max) {
      throw new BadRequestException(
        `${fieldName} harus berada di antara 1 dan ${max}`,
      );
    }
    return parsed;
  }

  private parseMinSimilarity(value: string | number | undefined): number | undefined {
    const parsed = this.parseOptionalNumber(value, 'minSimilarity');
    if (parsed == null) return undefined;
    if (parsed < 0 || parsed > 1) {
      throw new BadRequestException(
        'minSimilarity harus berada di antara 0 dan 1',
      );
    }
    return parsed;
  }
}
