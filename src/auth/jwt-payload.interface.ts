import { UserRole } from '../common/models';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email: string;
}
