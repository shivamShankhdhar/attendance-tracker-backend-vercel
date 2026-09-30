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

  async checkEmployeePinStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeCode = (req.query.employeeCode as string) || (req.body.employeeCode as string);
      const workplaceId = (req.query.workplaceId as string) || (req.body.workplaceId as string);
      if (!employeeCode) {
        throw new AppError('Employee code is required', 400, 'BAD_REQUEST');
      }
      const data = await authService.checkEmployeePinLoginStatus(employeeCode, workplaceId);
      res.status(200).json({ success: true, data });
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

  async setupMpin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { mpin, enableBiometric } = req.body;
      const data = await authService.setupMpin(req.user.userId, mpin, enableBiometric);
      res.status(200).json({ success: true, message: 'MPIN created successfully', data });
    } catch (error) {
      next(error);
    }
  }

  async verifyMpin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { mpin } = req.body;
      const data = await authService.verifyMpin(req.user.userId, mpin);
      res.status(200).json({ success: true, message: 'MPIN verified', data });
    } catch (error) {
      next(error);
    }
  }

  async requestMpinOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { purpose } = req.body;
      const data = await authService.requestMpinOtp(req.user.userId, purpose);
      res.status(200).json({ success: true, message: data.message, data });
    } catch (error) {
      next(error);
    }
  }

  async verifyMpinOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { otp, purpose } = req.body;
      const data = await authService.verifyMpinOtp(req.user.userId, otp, purpose);
      res.status(200).json({ success: true, message: data.message, data });
    } catch (error) {
      next(error);
    }
  }

  async resetMpin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { mpin, resetToken, enableBiometric } = req.body;
      const data = await authService.resetMpin(req.user.userId, mpin, resetToken, enableBiometric);
      res.status(200).json({ success: true, message: 'MPIN reset successfully', data });
    } catch (error) {
      next(error);
    }
  }

  async changeMpin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { oldMpin, newMpin, resetToken } = req.body;
      const data = await authService.changeMpin(req.user.userId, oldMpin, newMpin, resetToken);
      res.status(200).json({ success: true, message: 'MPIN changed successfully', data });
    } catch (error) {
      next(error);
    }
  }

  async setBiometric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const { enabled } = req.body;
      const data = await authService.setBiometric(req.user.userId, enabled);
      res.status(200).json({ success: true, message: 'Biometric preference updated', data });
    } catch (error) {
      next(error);
    }
  }

  async getMpinStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const data = await authService.getMpinStatus(req.user.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
