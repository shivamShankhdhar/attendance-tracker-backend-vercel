import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { workplaceRouter } from './modules/workplace/workplace.routes';
import { employeeRouter } from './modules/employee/employee.routes';
import { attendanceSessionRouter } from './modules/attendance-session/attendance-session.routes';
import { attendanceRequestRouter } from './modules/attendance-request/attendance-request.routes';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import { notificationRouter } from './modules/notification/notification.routes';
import { env } from './config/env';

export const app: Express = express();

// Security and middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Health check endpoint (for Vercel, monitors, load balancers)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// Direct alias for OAuth callback
app.get('/auth/callback', (req: Request, res: Response) => {
  res.redirect(307, '/api/v1/auth/google/callback');
});

// Direct aliases for workplace invitation preview
app.get(['/workplaces/join/:token', '/workplace/join/:token', '/join/:token'], (req: Request, res: Response) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  res.redirect(307, `/api/v1/workplaces/join/${encodeURIComponent(token || '')}`);
});

// Mount modular API v1 routes
const apiV1 = express.Router();

apiV1.use('/auth', authRouter);
apiV1.use('/workplaces', workplaceRouter);
apiV1.use('/workplace', workplaceRouter);
apiV1.use('/workplaces', employeeRouter);
apiV1.use('/workplace', employeeRouter);
apiV1.use('/workplaces', attendanceSessionRouter);
apiV1.use('/workplace', attendanceSessionRouter);
apiV1.use('/', attendanceRequestRouter);
apiV1.use('/workplaces', attendanceRequestRouter);
apiV1.use('/workplace', attendanceRequestRouter);
apiV1.use('/workplaces', attendanceRouter);
apiV1.use('/workplace', attendanceRouter);
apiV1.use('/', notificationRouter);

app.use('/api/v1', apiV1);

// 404 handler for unmatched routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
});

// Centralized error handling middleware
app.use(errorHandler);
