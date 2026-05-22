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
    const limit = bodyLimit ?? (queryLimit ? Number(queryLimit) : undefined);
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

    const parsedLimit = limit ? Number(limit) : undefined;
    if (limit && Number.isNaN(parsedLimit)) {
      throw new BadRequestException('limit harus berupa angka');
    }

    const parsedMinSimilarity = minSimilarity ? Number(minSimilarity) : undefined;
    if (minSimilarity && Number.isNaN(parsedMinSimilarity)) {
      throw new BadRequestException('minSimilarity harus berupa angka');
    }

    return this.qualityCaseDatasetService.getSimilarCasesForSubmission(
      submissionId.trim(),
      {
        limit: parsedLimit,
        minSimilarity: parsedMinSimilarity,
      },
    );
  }
}
