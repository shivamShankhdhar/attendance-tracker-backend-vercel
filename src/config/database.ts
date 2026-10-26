import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.prismaGlobal ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export async function ensureSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      "avatarUrl" TEXT,
      "googleSub" TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      "tokenVersion" INTEGER NOT NULL DEFAULT 1,
      "expoPushToken" TEXT,
      "mpinHash" TEXT,
      "mpinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
      "mpinLockedUntil" TIMESTAMP,
      "mpinAttemptVersion" INTEGER NOT NULL DEFAULT 0,
      "hasMpin" BOOLEAN NOT NULL DEFAULT false,
      "appLockEnabled" BOOLEAN NOT NULL DEFAULT false,
      "biometricEnabled" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';`,
    `ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL;`,
    `ALTER TABLE users ALTER COLUMN display_name SET DEFAULT '';`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "googleSub" TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 1;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "mpinHash" TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "mpinFailedAttempts" INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "mpinLockedUntil" TIMESTAMP;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "mpinAttemptVersion" INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "hasMpin" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "appLockEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "biometricEnabled" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT NOW();`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW();`,

    `CREATE TABLE IF NOT EXISTS mpin_otps (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      email TEXT NOT NULL,
      "otpHash" TEXT NOT NULL,
      purpose TEXT NOT NULL,
      "resetToken" TEXT UNIQUE,
      "isVerified" BOOLEAN NOT NULL DEFAULT false,
      attempts INTEGER NOT NULL DEFAULT 0,
      "expiresAt" TIMESTAMP NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS workplaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "workplaceCode" TEXT UNIQUE,
      "ownerId" TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      description TEXT,
      "joinInviteToken" TEXT UNIQUE,
      "joinInviteExpiresAt" TIMESTAMP,
      "previousJoinTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "joinShareUrl" TEXT,
      "wifiSsid" TEXT,
      "requireWifi" BOOLEAN NOT NULL DEFAULT false,
      "autoCloseHour" INTEGER NOT NULL DEFAULT 23,
      "allowEmployeeViewHistory" BOOLEAN NOT NULL DEFAULT true,
      "requireGeofence" BOOLEAN NOT NULL DEFAULT false,
      "geoLatitude" DOUBLE PRECISION,
      "geoLongitude" DOUBLE PRECISION,
      "geofenceRadius" DOUBLE PRECISION DEFAULT 100,
      "joinQrSecret" TEXT,
      "joinQrEnabled" BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      name TEXT NOT NULL,
      "teamCode" TEXT UNIQUE,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#5B692D',
      "isDefault" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS workplace_members (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "userId" TEXT,
      "teamId" TEXT,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      "employeeCode" TEXT,
      "invitedEmail" TEXT,
      "pinHash" TEXT,
      status TEXT NOT NULL DEFAULT 'INVITED',
      "invitationCode" TEXT UNIQUE,
      "invitationTokenHash" TEXT UNIQUE,
      "invitationExpiresAt" TIMESTAMP,
      "joinedAt" TIMESTAMP,
      "lastWifiSeenAt" TIMESTAMP,
      "lastConnectedSsid" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS workplace_join_requests (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "teamId" TEXT,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      "employeeCode" TEXT,
      "avatarUrl" TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      "reviewedById" TEXT,
      "reviewedAt" TIMESTAMP,
      "rejectionReason" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "createdById" TEXT NOT NULL,
      "attendanceDate" TEXT NOT NULL,
      "qrTokenHash" TEXT UNIQUE NOT NULL,
      "encryptedQrToken" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      "openedAt" TIMESTAMP NOT NULL,
      "expiresAt" TIMESTAMP NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS attendances (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "employeeMemberId" TEXT NOT NULL,
      "userId" TEXT,
      "attendanceDate" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PRESENT',
      "checkInTime" TIMESTAMP,
      "checkOutTime" TIMESTAMP,
      "approvedAt" TIMESTAMP,
      "approvedById" TEXT,
      source TEXT NOT NULL DEFAULT 'QR_REQUEST',
      "attendanceRequestId" TEXT,
      "qrVerified" BOOLEAN NOT NULL DEFAULT false,
      "wifiVerified" BOOLEAN,
      "geofenceVerified" BOOLEAN,
      "distanceMeters" DOUBLE PRECISION,
      "correctionReason" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS attendance_requests (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "attendanceSessionId" TEXT NOT NULL,
      "employeeMemberId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "attendanceDate" TEXT NOT NULL,
      "requestedAt" TIMESTAMP NOT NULL,
      "requestType" TEXT NOT NULL DEFAULT 'CHECK_IN',
      "qrVerified" BOOLEAN NOT NULL DEFAULT false,
      "wifiVerified" BOOLEAN,
      "geofenceVerified" BOOLEAN,
      "distanceMeters" DOUBLE PRECISION,
      "deviceSsid" TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      "reviewedById" TEXT,
      "reviewedAt" TIMESTAMP,
      "rejectionReason" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `ALTER TABLE attendance_requests ADD COLUMN IF NOT EXISTS note TEXT;`,
    `ALTER TABLE attendance_requests ADD COLUMN IF NOT EXISTS "proposedTime" TEXT;`,

    `CREATE TABLE IF NOT EXISTS notification_outboxes (
      id TEXT PRIMARY KEY,
      "eventId" TEXT UNIQUE NOT NULL,
      "recipientId" TEXT NOT NULL,
      "workplaceId" TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      "nextAttemptAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "lastError" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      "workplaceId" TEXT NOT NULL,
      "actorId" TEXT NOT NULL,
      action TEXT NOT NULL,
      "entityId" TEXT NOT NULL,
      metadata JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );`
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      console.warn('[Database Schema Warning] Failed executing statement:', err.message);
    }
  }
}

let schemaEnsured = false;

export async function connectDatabase(): Promise<PrismaClient> {
  try {
    await prisma.$connect();
    console.log('[Database] Connected to PostgreSQL (Neon)');
    if (!schemaEnsured) {
      await ensureSchema();
      schemaEnsured = true;
    }
    return prisma;
  } catch (error) {
    console.error('[Database] Failed to connect to PostgreSQL:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('[Database] Disconnected from PostgreSQL');
}

