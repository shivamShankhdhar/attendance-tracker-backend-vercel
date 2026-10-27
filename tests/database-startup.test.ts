import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, connectDatabase, disconnectDatabase } from '../src/config/database';

test('request startup shares connection, never runs schema DDL, and retries failed connects', async () => {
  const originalConnect = prisma.$connect;
  const originalDisconnect = prisma.$disconnect;
  const originalExecute = prisma.$executeRawUnsafe;
  let attempts = 0;
  let ddl = 0;
  (prisma as any).$disconnect = async () => {};
  (prisma as any).$executeRawUnsafe = async () => { ddl++; throw new Error('DDL must not run during requests'); };
  try {
    (prisma as any).$connect = async () => { attempts++; throw new Error('temporary outage'); };
    await assert.rejects(connectDatabase(), /temporary outage/);
    let release!: () => void;
    (prisma as any).$connect = () => { attempts++; return new Promise<void>(resolve => { release = resolve; }); };
    const calls = Array.from({ length: 20 }, () => connectDatabase());
    assert.ok(calls.every(call => call === calls[0]));
    release();
    await Promise.all(calls);
    await connectDatabase();
    assert.equal(attempts, 2);
    assert.equal(ddl, 0);
  } finally {
    await disconnectDatabase();
    prisma.$connect = originalConnect;
    prisma.$disconnect = originalDisconnect;
    prisma.$executeRawUnsafe = originalExecute;
  }
});
