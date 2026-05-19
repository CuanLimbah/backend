import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';
import { Roles } from '../common/roles.decorator';
import { QualityCheckDto } from './dto/quality-check.dto';
import { QualityAssessmentService } from './quality-assessment.service';

@Controller()
export class QualityAssessmentController {
  constructor(
    private readonly qualityAssessmentService: QualityAssessmentService,
  ) {}

  @Post('admin/submissions/:id/quality-check')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  runQualityCheck(
    @Param('id') id: string,
    @Body() dto: QualityCheckDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.qualityAssessmentService.analyzeSubmissionQuality({
      submissionId: id,
      requestedBy: user.id,
      conditionDescription: dto.conditionDescription,
    });
  }
}
