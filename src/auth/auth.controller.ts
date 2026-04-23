import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { PublicUser } from '../common/models';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('google')
  google(@Res() res: Response) {
    try {
      return res.redirect(this.authService.getGoogleAuthorizationUrl());
    } catch (error) {
      return res.redirect(
        this.authService.buildGoogleErrorRedirect(
          this.authService.getReadableGoogleError(error),
        ),
      );
    }
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        this.authService.buildGoogleErrorRedirect(
          `Login Google dibatalkan: ${error}`,
        ),
      );
    }

    if (!code) {
      return res.redirect(
        this.authService.buildGoogleErrorRedirect(
          'Callback Google tidak mengandung authorization code.',
        ),
      );
    }

    try {
      const result = await this.authService.loginWithGoogle(code);
      return res.redirect(
        this.authService.buildGoogleSuccessRedirect(
          result.accessToken,
          result.redirectTo,
        ),
      );
    } catch (error) {
      return res.redirect(
        this.authService.buildGoogleErrorRedirect(
          this.authService.getReadableGoogleError(error),
        ),
      );
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: PublicUser) {
    return this.authService.me(user.id);
  }
}
