import { app } from './app';
import { connectDatabase } from './config/database';
import { env } from './config/env';

async function bootstrap() {
  try {
    // 1. Connect to MongoDB
    try {
      await connectDatabase();
    } catch (dbErr) {
      console.error('[Server Warning] Could not connect to MongoDB on startup:', (dbErr as any)?.message || dbErr);
      if (env.NODE_ENV === 'production') {
        throw dbErr;
      }
    }

    // 2. Start HTTP listener
    const server = app.listen(env.PORT, () => {
      console.log(`[Server] Attendance Tracker API listening on port ${env.PORT} (${env.NODE_ENV})`);
      console.log(`[Server] Health check: http://localhost:${env.PORT}/health`);
      console.log(`[Server] API v1 base: http://localhost:${env.PORT}/api/v1`);
    });

    // Graceful shutdown handling
    const shutdown = () => {
      console.log('\n[Server] Shutting down gracefully...');
      server.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('[Server] Fatal startup failure:', error);
    process.exit(1);
  }
}

void bootstrap();
