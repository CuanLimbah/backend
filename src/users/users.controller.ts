import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';

@Controller('users/me')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: PublicUser) {
    return this.usersService.getMe(user.id);
  }

  @Get('stats')
  getStats(@CurrentUser() user: PublicUser) {
    return this.usersService.getUserStats(user.id);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: PublicUser) {
    return this.usersService.getDashboard(user.id);
  }
}
