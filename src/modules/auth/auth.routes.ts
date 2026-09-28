import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
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
      padding: 16px;
      box-sizing: border-box;
    }
    .box {
      text-align: center;
      padding: 32px 24px;
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 20px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    .spinner {
      border: 3px solid rgba(255,255,255,0.15);
      border-top: 3px solid #38BDF8;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin: 0 0 8px 0; font-size: 19px; font-weight: 700; }
    p { margin: 0 0 16px 0; font-size: 13.5px; color: #94A3B8; line-height: 1.5; }
    .btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-top: 12px;
      padding: 12px 20px;
      background: #2563EB;
      color: #fff;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
      border: none;
      cursor: pointer;
    }
    .btn-secondary {
      background: #334155;
      color: #E2E8F0;
      font-size: 13.5px;
      padding: 10px 16px;
    }
    .token-box {
      margin-top: 14px;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px;
      font-family: monospace;
      font-size: 11px;
      color: #38BDF8;
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2>Authenticated!</h2>
    <p id="status-text">Returning you to the Attendance Tracker app...</p>
    <a id="fallback-btn" href="#" class="btn">Return to App</a>
    <button id="copy-btn" class="btn btn-secondary" onclick="copyToken()">📋 Copy Token & Return</button>
    <div id="token-display" class="token-box" style="display:none;"></div>
  </div>
  <script>
    var globalToken = "";
    (function() {
      var hash = window.location.hash ? window.location.hash.substring(1) : '';
      var search = window.location.search ? window.location.search.substring(1) : '';
      var raw = hash || search;
      var params = new URLSearchParams(raw);
      var stateParam = params.get('state');
      var idToken = params.get('id_token');
      if (idToken) {
        globalToken = idToken;
        var tokenEl = document.getElementById('token-display');
        if (tokenEl) {
          tokenEl.innerText = idToken;
          tokenEl.style.display = 'block';
        }
      }

      var targetReturnUrl = '';
      if (stateParam) {
        try {
          var decoded = decodeURIComponent(stateParam);
          if (decoded.startsWith('exp://') || decoded.startsWith('quickattendance://') || decoded.startsWith('frontend://') || decoded.startsWith('http')) {
            targetReturnUrl = decoded;
          }
        } catch(e) {}
      }

      if (!targetReturnUrl) {
        targetReturnUrl = "quickattendance://auth";
      }

      var sep = targetReturnUrl.includes('?') ? '&' : (targetReturnUrl.includes('#') ? '&' : '?');
      var finalAppUrl = targetReturnUrl + sep + raw;
      
      var btn = document.getElementById('fallback-btn');
      if (btn) {
        btn.href = finalAppUrl;
      }

      // Automatically trigger navigation
      window.location.href = finalAppUrl;

      // Fallback secondary attempts
      setTimeout(function() {
        if (targetReturnUrl.startsWith('exp://')) {
          window.location.href = finalAppUrl;
        } else {
          window.location.href = "quickattendance://auth?" + raw;
        }
      }, 600);
    })();

    function copyToken() {
      if (globalToken) {
        navigator.clipboard.writeText(globalToken).then(function() {
          alert('Token copied! Switch back to Attendance Tracker and tap "Paste Token"');
        }).catch(function() {
          alert('Token copied!');
        });
      }
    }
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

authRouter.post('/logout', optionalAuthenticate, authController.logout);
