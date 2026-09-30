import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserModel } from '../src/modules/auth/user.model';
import { AuthService } from '../src/modules/auth/auth.service';
import { AppError } from '../src/middleware/errorHandler';

const service = new AuthService();
let mongo: MongoMemoryServer;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function account() {
  const user = await UserModel.create({ name: 'MPIN test', status: 'ACTIVE' });
  await service.setupMpin(user.id, '2580');
  return user.id as string;
}
test('progressive lockout: 30s first, then 2m, 5m, 10m, 20m, and 24h', async () => {
  const id = await account();
  const version = (await UserModel.findById(id))!.tokenVersion;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
      assert.equal(error.errorCode, attempt < 5 ? 'INVALID_MPIN' : 'MPIN_LOCKED');
      assert.equal(error.statusCode, attempt < 5 ? 400 : 429);
      assert.equal(error.details.attemptsRemaining, 5 - attempt);
      return true;
    });
  }
  // 1st lockout: 30 seconds
  const status1 = await service.getMpinStatus(id);
  const remaining1 = Date.parse(status1.lockedUntil!) - Date.now();
  assert.ok(remaining1 > 28000 && remaining1 <= 30000, `Expected ~30s, got ${remaining1}`);

  await assert.rejects(service.verifyMpin(id, '2580'), (e: AppError) => e.errorCode === 'MPIN_LOCKED');
  assert.equal((await UserModel.findById(id))!.tokenVersion, version);

  // Expire 30s lockout and fail 6th time -> 2 minutes (120s)
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
    assert.equal(error.errorCode, 'MPIN_LOCKED');
    assert.equal(error.details.retryAfterSeconds, 120);
    return true;
  });

  // Expire 2m lockout and fail 7th time -> 5 minutes (300s)
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
    assert.equal(error.errorCode, 'MPIN_LOCKED');
    assert.equal(error.details.retryAfterSeconds, 300);
    return true;
  });

  // Expire 5m lockout and fail 8th time -> 10 minutes (600s)
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
    assert.equal(error.errorCode, 'MPIN_LOCKED');
    assert.equal(error.details.retryAfterSeconds, 600);
    return true;
  });

  // Expire 10m lockout and fail 9th time -> 20 minutes (1200s)
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
    assert.equal(error.errorCode, 'MPIN_LOCKED');
    assert.equal(error.details.retryAfterSeconds, 1200);
    return true;
  });

  // Expire 20m lockout and fail 10th time -> 24 hours (86400s)
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (error: AppError) => {
    assert.equal(error.errorCode, 'MPIN_LOCKED');
    assert.equal(error.details.retryAfterSeconds, 86400);
    return true;
  });

  // Entering correct MPIN clears lockout completely
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  assert.equal((await service.verifyMpin(id, '2580')).verified, true);
  assert.equal((await service.getMpinStatus(id)).lockedUntil, null);
  assert.equal((await service.getMpinStatus(id)).attemptsRemaining, 5);
});
test('parallel wrong guesses cannot exceed five attempts or bypass lockout', async () => {
  const id = await account();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.verifyMpin(id, '0000')));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 0);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.errorCode === 'INVALID_MPIN').length, 4);
  assert.equal((await UserModel.findById(id))!.mpinFailedAttempts, 5);
  assert.equal((await service.getMpinStatus(id)).attemptsRemaining, 0);
  const otherId = await account();
  assert.equal((await service.verifyMpin(otherId, '2580')).verified, true);
});
test('success resets consecutive failures and expired cooldown starts a fresh attempt window', async () => {
  const id = await account();
  await assert.rejects(service.verifyMpin(id, '0000'));
  await service.verifyMpin(id, '2580');
  assert.equal((await service.getMpinStatus(id)).attemptsRemaining, 5);
  // After 24h+ since expired lockout, attempt counter resets window
  await UserModel.updateOne({ _id: id }, { $set: { mpinFailedAttempts: 5, mpinLockedUntil: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (e: AppError) => e.details.attemptsRemaining === 4);
});
