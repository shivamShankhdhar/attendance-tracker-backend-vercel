import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { UserModel } from './user.model';
import { AppError } from '../../middleware/errorHandler';

export class AuthController {
  async exchangeGoogleToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await authService.exchangeGoogleToken(req.body);
      res.status(200).json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  async loginWithPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { workplaceId, employeeCode, pin, expoPushToken } = req.body;
      const session = await authService.loginWithPin(workplaceId, employeeCode, pin, expoPushToken);
      res.status(200).json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshAccessToken(refreshToken);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await authService.getMe(req.user.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updatePushToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { expoPushToken } = req.body;
      await UserModel.findByIdAndUpdate(req.user.userId, { expoPushToken });
      res.status(200).json({ success: true, message: 'Push token updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        // Increment tokenVersion to revoke all outstanding refresh tokens
        await UserModel.findByIdAndUpdate(req.user.userId, { $inc: { tokenVersion: 1 } });
      }
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
