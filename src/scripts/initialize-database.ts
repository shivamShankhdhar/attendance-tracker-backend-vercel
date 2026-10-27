import 'dotenv/config';
import { connectDatabase, ensureSchema, disconnectDatabase } from '../config/database';

async function main() {
  try {
    await connectDatabase();
    await ensureSchema();
    console.log('Database schema initialized');
  } finally {
    await disconnectDatabase();
  }
}
main().catch(error => {
  console.error('Database initialization failed:', error);
  process.exitCode = 1;
});
