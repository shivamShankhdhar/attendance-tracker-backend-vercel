import { app } from '../src/app';
import { connectDatabase } from '../src/config/database';

export default async function handler(req: any, res: any) {
  // Ensure cached MongoDB connection is ready per warm Vercel function
  await connectDatabase();
  return app(req, res);
}
