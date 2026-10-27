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

global.prismaGlobal = prisma;

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
      note TEXT,
      "proposedTime" TEXT,
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

    `DELETE FROM attendance_requests a USING attendance_requests b
      WHERE a.ctid < b.ctid
        AND a."workplaceId" = b."workplaceId"
        AND a."employeeMemberId" = b."employeeMemberId"
        AND a."attendanceDate" = b."attendanceDate"
        AND a."requestType" = b."requestType";`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "attendance_requests_workplaceId_employeeMemberId_attendanceDate_requestType_key"
      ON attendance_requests ("workplaceId", "employeeMemberId", "attendanceDate", "requestType");`,

    `DELETE FROM attendances a USING attendances b
      WHERE a.ctid < b.ctid
        AND a."workplaceId" = b."workplaceId"
        AND a."employeeMemberId" = b."employeeMemberId"
        AND a."attendanceDate" = b."attendanceDate";`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "attendances_workplaceId_employeeMemberId_attendanceDate_key"
      ON attendances ("workplaceId", "employeeMemberId", "attendanceDate");`,

    `DELETE FROM attendance_sessions a USING attendance_sessions b
      WHERE a.ctid < b.ctid
        AND a."workplaceId" = b."workplaceId"
        AND a."attendanceDate" = b."attendanceDate";`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_workplaceId_attendanceDate_key"
      ON attendance_sessions ("workplaceId", "attendanceDate");`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "workplace_members_workplaceId_userId_key"
      ON workplace_members ("workplaceId", "userId");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "workplace_members_workplaceId_employeeCode_key"
      ON workplace_members ("workplaceId", "employeeCode");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "teams_workplaceId_name_key"
      ON teams ("workplaceId", name);`,

    `DROP TABLE IF EXISTS audit_logs CASCADE;`
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      console.error('[Database Schema Error] Failed executing statement:', err.message);
      throw err;
    }
  }
  schemaChecked = true;
}

let schemaChecked = false;

// One connection attempt per warm instance. Fast single-query check prevents
// redundant DDL on warm starts.
let connection: Promise<PrismaClient> | undefined;
let schemaEnsured = false;

export function connectDatabase(): Promise<PrismaClient> {
  if (!connection) {
    connection = prisma.$connect().then(async () => {
      const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
      if (!schemaEnsured && !isTest) {
        try {
          // Fast-path: check if composite unique index already exists
          const exists: any = await prisma.$queryRawUnsafe(
            `SELECT 1 FROM pg_indexes WHERE indexname = 'attendance_requests_workplaceId_employeeMemberId_attendanceDate_requestType_key' LIMIT 1;`
          ).catch(() => []);
          if (Array.isArray(exists) && exists.length > 0) {
            schemaChecked = true;
            schemaEnsured = true;
          } else {
            await ensureSchema();
            schemaEnsured = true;
          }
        } catch (schemaErr: any) {
          console.warn('[Schema Init Warning] Could not auto-ensure schema:', schemaErr?.message);
        }
      }
      return prisma;
    }).catch(error => {
      connection = undefined; // A transient outage must not poison this instance.
      throw error;
    });
  }
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  const pending = connection;
  connection = undefined;
  await pending?.catch(() => undefined);
  await prisma.$disconnect();
}
