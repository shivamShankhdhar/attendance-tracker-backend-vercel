import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  QR_ENCRYPTION_KEY: z.string().min(32, 'QR_ENCRYPTION_KEY must be at least 32 characters hex'),
  GOOGLE_CLIENT_IDS: z.string().optional().default(''),
  RETRY_SECRET: z.string().optional().default('dev_retry_secret'),
  APP_NAME: z.string().default('Bizora'),
  WORKPLACE_JOIN_URL: z.string().url().default('https://www.bizora.shivamshankhdhar.online/join'),
});

const parsedEnv = envSchema.safeParse(process.env);

let envData: z.infer<typeof envSchema>;

if (!parsedEnv.success) {
  const missingKeys = Object.keys(parsedEnv.error.format()).filter((k) => k !== '_errors');
  console.warn('[Config Warning] Missing or invalid environment variables:', missingKeys, 'Using safe fallbacks.');
  envData = {
    PORT: Number(process.env.PORT) || 5001,
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance-tracker',
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'fallback_dummy_secret_for_diagnostics_minimum_32_chars',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'fallback_dummy_secret_for_diagnostics_minimum_32_chars',
    JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
    JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
    QR_ENCRYPTION_KEY: process.env.QR_ENCRYPTION_KEY || 'fallback_dummy_key_for_diagnostics_32_bytes_hex_val',
    GOOGLE_CLIENT_IDS: process.env.GOOGLE_CLIENT_IDS || '',
    RETRY_SECRET: process.env.RETRY_SECRET || 'dev_retry_secret',
    APP_NAME: process.env.APP_NAME || 'Bizora',
    WORKPLACE_JOIN_URL: process.env.WORKPLACE_JOIN_URL || 'https://www.bizora.shivamshankhdhar.online/join',
  };
} else {
  envData = parsedEnv.data;
}

export const env = envData;

const KNOWN_GOOGLE_CLIENT_IDS = [
  '667573150359-4cff25jgf98hqq00pdrnojslk4bri5sb.apps.googleusercontent.com',
  '771745956735-dt868k5lrced43dicn5ifeh54la1djc7.apps.googleusercontent.com',
];

export const googleClientIds = Array.from(
  new Set([
    ...KNOWN_GOOGLE_CLIENT_IDS,
    ...(env.GOOGLE_CLIENT_IDS
      ? env.GOOGLE_CLIENT_IDS.split(',').map((id) => id.trim()).filter(Boolean)
      : []),
  ])
);
