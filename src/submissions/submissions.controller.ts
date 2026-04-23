import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { VerifySubmissionDto } from './dto/verify-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import type { PublicUser } from '../common/models';

@Controller()
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post('submissions')
  @UseGuards(AuthGuard)
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.create(user.id, dto);
  }

  @Get('submissions/me')
  @UseGuards(AuthGuard)
  findMine(@CurrentUser() user: PublicUser) {
    return this.submissionsService.findMine(user.id);
  }

  @Get('admin/submissions')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  findPending() {
    return this.submissionsService.findPending();
  }

  @Patch('admin/submissions/:id/verify')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  verify(
    @Param('id') id: string,
    @Body() dto: VerifySubmissionDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.submissionsService.verify(id, dto, user.id);
  }

  @Patch('admin/submissions/:id/reject')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectSubmissionDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.submissionsService.reject(id, dto, user.id);
  }
}
