import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenUserPayload {
  userId: string;
  email?: string;
  phone?: string;
  role?: 'EMPLOYER' | 'EMPLOYEE';
  workplaceId?: string;
}

export interface AccessTokenPayload extends TokenUserPayload {
  type: 'access';
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion?: number;
  type: 'refresh';
}

export function generateAccessToken(payload: TokenUserPayload): string {
  const tokenPayload: AccessTokenPayload = {
    ...payload,
    type: 'access',
  };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRY as any,
  };
  return jwt.sign(tokenPayload, env.JWT_ACCESS_SECRET, options);
}

export function generateRefreshToken(userId: string, tokenVersion: number = 1): string {
  const tokenPayload: RefreshTokenPayload = {
    userId,
    tokenVersion,
    type: 'refresh',
  };
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRY as any,
  };
  return jwt.sign(tokenPayload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}
