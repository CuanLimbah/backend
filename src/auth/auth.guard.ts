import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedRequest } from '../common/authenticated-request.interface';
import { toPublicUser } from '../common/utils';
import { UserEntity } from '../database/schemas/user.schema';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authorization header wajib diisi');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Format authorization harus Bearer <token>');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.userModel.findOne({ id: payload.sub }).lean().exec();

    if (!user) {
      throw new UnauthorizedException('User untuk token ini tidak ditemukan');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Akun Anda sedang tidak aktif');
    }

    request.user = toPublicUser(user);
    request.token = token;
    request.auth = payload;
    return true;
  }
}
