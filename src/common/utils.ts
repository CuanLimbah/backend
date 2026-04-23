import { compareSync, genSaltSync, hashSync } from 'bcryptjs';
import { PublicUser, UserRecord } from './models';

export function hashPassword(password: string): string {
  return hashSync(password, genSaltSync(10));
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return compareSync(password, passwordHash);
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { password_hash, ...publicUser } = user;
  return publicUser;
}

export function toPlainObject<T extends Record<string, unknown>>(
  value: T | { toObject: () => T },
): T {
  const object =
    typeof (value as { toObject?: () => T }).toObject === 'function'
      ? (value as { toObject: () => T }).toObject()
      : (value as T);

  const { _id, __v, ...plainObject } = object as T & {
    _id?: unknown;
    __v?: unknown;
  };

  return plainObject as T;
}

export function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

export function toCurrencyAmount(value: number): number {
  return Math.round(value);
}
