import { app } from '../src/app';
import { connectDatabase } from '../src/config/database';

export default async function handler(req: any, res: any) {
  const url = req.url || '';
  const isHealthCheck = url === '/health' || url.startsWith('/health') || url.includes('/health');

  if (!isHealthCheck) {
    try {
      await connectDatabase();
    } catch (error: any) {
      console.error('[Vercel Database Connection Error]:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: error?.message || 'Database connection error',
          help: 'Please verify that MONGODB_URI is set in Vercel Environment Variables and Network Access is allowed in MongoDB Atlas.',
        },
      });
    }
  }

  return app(req, res);
}
