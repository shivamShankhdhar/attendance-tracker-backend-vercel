import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { rateLimiter } from '../../middleware/rateLimiter';
import {
  googleExchangeSchema,
  employeePinLoginSchema,
  refreshTokenSchema,
  updatePushTokenSchema,
} from './auth.schema';

export const authRouter = Router();

// Rate limited login endpoints
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 30,
  message: 'Too many authentication attempts. Please try again later.',
});

authRouter.post(
  '/google/exchange',
  authLimiter,
  validateRequest({ body: googleExchangeSchema }),
  authController.exchangeGoogleToken
);

authRouter.post(
  '/employee-pin-login',
  authLimiter,
  validateRequest({ body: employeePinLoginSchema }),
  authController.loginWithPin
);

authRouter.post(
  '/refresh',
  rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 60 }),
  validateRequest({ body: refreshTokenSchema }),
  authController.refreshToken
);

authRouter.get('/me', authenticate, authController.getMe);

authRouter.post(
  '/push-token',
  authenticate,
  validateRequest({ body: updatePushTokenSchema }),
  authController.updatePushToken
);

authRouter.post('/logout', authenticate, authController.logout);
