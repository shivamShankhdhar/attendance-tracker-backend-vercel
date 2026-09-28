import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenUserPayload } from '../utils/jwt';
import { AppError } from './errorHandler';
import { UserModel } from '../modules/auth/user.model';

declare global {
  namespace Express {
    interface Request {
      user?: TokenUserPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token is required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Verify user still exists and is ACTIVE
    const user = await UserModel.findById(payload.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User account is inactive or not found', 401, 'USER_INACTIVE');
    }

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}
