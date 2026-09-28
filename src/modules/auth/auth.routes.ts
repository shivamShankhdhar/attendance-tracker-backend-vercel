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

authRouter.get('/google/callback', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signing In - QuickAttendance</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0F172A;
      color: #FFFFFF;
    }
    .box {
      text-align: center;
      padding: 36px 28px;
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 20px;
      max-width: 340px;
      width: 90%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .spinner {
      border: 3px solid rgba(255,255,255,0.15);
      border-top: 3px solid #38BDF8;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin: 0 0 8px 0; font-size: 19px; font-weight: 700; }
    p { margin: 0; font-size: 13.5px; color: #94A3B8; line-height: 1.5; }
    .btn {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #2563EB;
      color: #fff;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>Signing you in...</h2>
    <p>Redirecting you back to QuickAttendance</p>
    <a id="fallback-btn" href="#" class="btn" style="display:none;">Return to App</a>
  </div>
  <script>
    (function() {
      var hash = window.location.hash ? window.location.hash.substring(1) : '';
      var search = window.location.search ? window.location.search.substring(1) : '';
      var params = hash || search;
      var quickUrl = "quickattendance://auth?" + params;
      var frontUrl = "frontend://auth?" + params;
      
      var btn = document.getElementById('fallback-btn');
      if (btn) {
        btn.href = quickUrl;
      }

      window.location.replace(quickUrl);
      setTimeout(function() {
        window.location.replace(frontUrl);
        if (btn) btn.style.display = 'inline-block';
      }, 500);
    })();
  </script>
</body>
</html>`);
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
