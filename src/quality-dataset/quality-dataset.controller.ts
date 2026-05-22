import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
}
