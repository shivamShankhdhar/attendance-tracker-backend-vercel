import { app } from '../src/app';
import { connectDatabase } from '../src/config/database';

const handler = async (req: any, res: any) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const isStaticOrHealth = url === '/health' || url.includes('/health') || url.includes('/callback');

  if (!isStaticOrHealth) {
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
};

export default handler;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = handler;
  module.exports.default = handler;
}
