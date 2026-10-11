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

export async function connectDatabase(): Promise<PrismaClient> {
  try {
    await prisma.$connect();
    console.log('[Database] Connected to PostgreSQL (Neon)');
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
