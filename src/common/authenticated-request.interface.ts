import { Request } from 'express';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { PublicUser } from './models';

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
  token: string;
  auth?: JwtPayload;
}
