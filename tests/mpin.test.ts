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
test('five incorrect attempts lock MPIN for 30 minutes without revoking the account session', async () => {
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
  const status = await service.getMpinStatus(id);
  const remaining = Date.parse(status.lockedUntil!) - Date.now();
  assert.ok(remaining > 1790000 && remaining <= 1800000);
  await assert.rejects(service.verifyMpin(id, '2580'), (e: AppError) => e.errorCode === 'MPIN_LOCKED');
  await assert.rejects(service.setupMpin(id, '9999'), (e: AppError) => e.errorCode === 'MPIN_LOCKED');
  await assert.rejects(service.changeMpin(id, '2580', '9999'), (e: AppError) => e.errorCode === 'MPIN_LOCKED');
  assert.equal((await UserModel.findById(id))!.tokenVersion, version);
  await UserModel.updateOne({ _id: id }, { $set: { mpinLockedUntil: new Date(Date.now() - 1) } });
  assert.equal((await service.getMpinStatus(id)).attemptsRemaining, 5);
  assert.equal((await service.verifyMpin(id, '2580')).verified, true);
  assert.equal((await service.getMpinStatus(id)).lockedUntil, null);
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
  await UserModel.updateOne({ _id: id }, { $set: { mpinFailedAttempts: 5, mpinLockedUntil: new Date(Date.now() - 1) } });
  await assert.rejects(service.verifyMpin(id, '0000'), (e: AppError) => e.details.attemptsRemaining === 4);
});
