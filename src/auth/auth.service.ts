import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import type { PublicUser, UserRecord } from '../common/models';
import {
  hashPassword,
  toPlainObject,
  toPublicUser,
  verifyPassword,
} from '../common/utils';
import { UserEntity } from '../database/schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly frontendUrl =
    process.env.FRONTEND_URL?.trim() || 'http://localhost:5173';

  private readonly googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();

  private readonly googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  private readonly googleRedirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    'http://localhost:3000/auth/google/callback';

  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; user: PublicUser; redirectTo: string }> {
    const fullName = dto.fullName?.trim();
    const businessName = dto.businessName?.trim();
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password?.trim();
    const confirmPassword = dto.confirmPassword?.trim();

    if (!fullName) {
      throw new BadRequestException('Nama lengkap wajib diisi');
    }

    if (!email) {
      throw new BadRequestException('Email wajib diisi');
    }

    if (!password || password.length < 8) {
      throw new BadRequestException('Password minimal 8 karakter');
    }

    if (confirmPassword && password !== confirmPassword) {
      throw new BadRequestException('Password dan konfirmasi password tidak cocok');
    }

    if (await this.userModel.exists({ email })) {
      throw new BadRequestException('Email sudah terdaftar');
    }

    const createdUser = await this.userModel.create({
      id: `user-${randomUUID()}`,
      email,
      full_name: fullName,
      business_name: businessName || undefined,
      password_hash: hashPassword(password),
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    const user = toPublicUser(
      toPlainObject(createdUser) as unknown as UserRecord,
    );

    return {
      accessToken: await this.issueAccessToken(user),
      user,
      redirectTo: '/dashboard',
    };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: PublicUser; redirectTo: string }> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password?.trim();

    if (!email || !password) {
      throw new BadRequestException('Email dan password wajib diisi');
    }

    const user = await this.userModel.findOne({ email }).lean().exec();

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Akun Anda sedang tidak aktif');
    }

    const publicUser = toPublicUser(user);

    return {
      accessToken: await this.issueAccessToken(publicUser),
      user: publicUser,
      redirectTo: user.role === 'admin' ? '/admin' : '/dashboard',
    };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.userModel.findOne({ id: userId }).lean().exec();

    if (!user) {
      throw new UnauthorizedException('User tidak ditemukan');
    }

    return toPublicUser(user);
  }

  getGoogleAuthorizationUrl(): string {
    this.ensureGoogleOAuthConfigured();

    const params = new URLSearchParams({
      client_id: this.googleClientId!,
      redirect_uri: this.googleRedirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: Buffer.from(
        JSON.stringify({
          nonce: randomUUID(),
          ts: Date.now(),
        }),
      ).toString('base64url'),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async loginWithGoogle(code: string): Promise<{
    accessToken: string;
    user: PublicUser;
    redirectTo: string;
  }> {
    this.ensureGoogleOAuthConfigured();

    const tokensResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.googleClientId!,
        client_secret: this.googleClientSecret!,
        redirect_uri: this.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokensData = (await tokensResponse.json().catch(() => null)) as
      | {
          access_token?: string;
          error?: string;
          error_description?: string;
        }
      | null;

    if (!tokensResponse.ok || !tokensData?.access_token) {
      throw new BadRequestException(
        tokensData?.error_description ||
          tokensData?.error ||
          'Gagal menukar authorization code Google.',
      );
    }

    const profileResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokensData.access_token}`,
        },
      },
    );

    const profileData = (await profileResponse.json().catch(() => null)) as
      | {
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        }
      | null;

    if (!profileResponse.ok || !profileData?.email) {
      throw new BadRequestException('Google tidak mengembalikan email pengguna.');
    }

    if (profileData.email_verified === false) {
      throw new UnauthorizedException('Email Google belum terverifikasi.');
    }

    const email = profileData.email.trim().toLowerCase();
    let user = await this.userModel.findOne({ email }).exec();

    if (!user) {
      user = await this.userModel.create({
        id: `user-${randomUUID()}`,
        email,
        full_name: profileData.name?.trim() || email.split('@')[0],
        business_name: undefined,
        password_hash: hashPassword(randomUUID()),
        role: 'user',
        status: 'active',
        created_at: new Date().toISOString(),
        avatar_url: profileData.picture,
      });
    } else {
      user.full_name = profileData.name?.trim() || user.full_name;
      user.avatar_url = profileData.picture || user.avatar_url;
      await user.save();
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Akun Anda sedang tidak aktif.');
    }

    const publicUser = toPublicUser(
      toPlainObject(user) as unknown as UserRecord,
    );

    return {
      accessToken: await this.issueAccessToken(publicUser),
      user: publicUser,
      redirectTo: user.role === 'admin' ? '/admin' : '/dashboard',
    };
  }

  buildGoogleSuccessRedirect(accessToken: string, redirectTo: string): string {
    const params = new URLSearchParams({
      accessToken,
      redirectTo,
    });

    return `${this.frontendUrl}/auth/callback?${params.toString()}`;
  }

  buildGoogleErrorRedirect(message: string): string {
    const params = new URLSearchParams({
      oauthError: message,
    });

    return `${this.frontendUrl}/login?${params.toString()}`;
  }

  getReadableGoogleError(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        Array.isArray(response.message)
      ) {
        return response.message.join(', ');
      }
    }

    if (error instanceof UnauthorizedException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Google OAuth gagal diproses.';
  }

  private ensureGoogleOAuthConfigured() {
    if (!this.googleClientId || !this.googleClientSecret || !this.googleRedirectUri) {
      throw new InternalServerErrorException(
        'Google OAuth belum dikonfigurasi di server. Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI.',
      );
    }
  }

  private issueAccessToken(user: PublicUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email,
    };

    return this.jwtService.signAsync(payload);
  }
}
