import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/roles.decorator';
import { QualityAuditLogService } from './quality-audit-log.service';

@Controller('admin/analytics')
export class QualityAuditController {
  constructor(private readonly qualityAuditLogService: QualityAuditLogService) {}

  @Get('quality-ai')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  getQualityAiAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('wasteType') wasteType?: 'food' | 'oil',
  ) {
    return this.qualityAuditLogService.getAnalytics({
      startDate,
      endDate,
      wasteType,
    });
  }

  @Get('multimodal-rag/retrieval-quality')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async getMultimodalRagRetrievalQuality(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('wasteType') wasteType?: 'food' | 'oil',
  ) {
    const analytics = await this.qualityAuditLogService.getAnalytics({
      startDate,
      endDate,
      wasteType,
    });

    return analytics.multimodalRag.retrievalQuality;
  }
}
