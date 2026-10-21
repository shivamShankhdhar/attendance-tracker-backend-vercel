import fs from 'fs';
import path from 'path';
import { app } from '../src/app';
import { connectDatabase } from '../src/config/database';

let cachedHtml: string | null = null;
function getIndexHtml(): string {
  if (cachedHtml) return cachedHtml;
  try {
    const candidates = [
      path.join(process.cwd(), 'public', 'index.html'),
      path.join(__dirname, '..', 'public', 'index.html'),
      path.join(__dirname, 'public', 'index.html'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        cachedHtml = fs.readFileSync(p, 'utf-8');
        return cachedHtml;
      }
    }
  } catch (err) {
    console.warn('[Vercel Static Error] Could not read public/index.html:', err);
  }
  return '';
}

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

  const url = (req.url || '').split('?')[0];
  const acceptHeader = (req.headers && req.headers['accept']) || '';

  if (url === '/' || url === '' || url === '/index.html') {
    if (acceptHeader.includes('text/html') || !acceptHeader.includes('application/json')) {
      const html = getIndexHtml();
      if (html) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
      }
    }
    return res.status(200).json({
      status: 'healthy',
      name: 'Bizora Attendance Tracker API',
      message: 'All systems operational',
      database: 'PostgreSQL (Neon) via Prisma ORM',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'production',
    });
  }

  if (url === '/api' || url === '/api/') {
    return res.status(200).json({
      status: 'healthy',
      name: 'Bizora Attendance Tracker API',
      message: 'All systems operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'production',
    });
  }

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
          help: 'Please verify that POSTGRES_URL is set in Vercel Environment Variables and Network Access is allowed in Neon PostgreSQL.',
        },
      });
    }
  }

  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    res.on('finish', finish);
    res.on('close', finish);
    res.on('error', (err: any) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    try {
      app(req, res);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    }
  });
};

export default handler;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = handler;
  module.exports.default = handler;
}
