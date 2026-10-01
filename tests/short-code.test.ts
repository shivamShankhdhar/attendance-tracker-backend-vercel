import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { WorkplaceService } from '../src/modules/workplace/workplace.service';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { WorkplaceJoinRequestModel } from '../src/modules/workplace/workplace-join-request.model';
import { NotificationOutboxModel } from '../src/modules/notification/notification.model';
import { UserModel } from '../src/modules/auth/user.model';

let mongo: MongoMemoryReplSet;
const service = new WorkplaceService();

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    WorkplaceModel.init(),
    WorkplaceJoinRequestModel.init(),
    WorkplaceMemberModel.init(),
    NotificationOutboxModel.init(),
    UserModel.init(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('workplace join token is 8 chars or less with hyphen, and migrates legacy 64-char token safely', async () => {
  const owner = await UserModel.create({ name: 'Owner Vikram', status: 'ACTIVE' });
  const applicant = await UserModel.create({ name: 'Applicant Tina', status: 'ACTIVE' });

  // 1. Create a workplace simulating an existing workplace with a 64-character token
  const legacyToken = 'fc2034b79c9c3665275a738df5a59634f4784eee78ad897761b452fd3fb40148';
  const { workplace } = await service.createWorkplace(owner.id, {
    name: 'Short Code Tech',
    address: 'Connaught Place, New Delhi',
  });

  // Manually set the 64-character token as if it was created in the older version
  await WorkplaceModel.updateOne({ _id: workplace.id }, { $set: { joinInviteToken: legacyToken } });

  // 2. Fetch the join QR / link
  const qrRes = await service.getJoinQr(workplace.id);

  // Assert that qrToken is <= 8 characters
  assert.ok(qrRes.qrToken.length <= 8, `Expected qrToken <= 8 chars, got ${qrRes.qrToken} (length ${qrRes.qrToken.length})`);
  assert.ok(qrRes.qrToken.includes('-'), `Expected hyphen in qrToken: ${qrRes.qrToken}`);

  // Assert the join link uses the short code
  assert.ok(qrRes.joinLink.endsWith(`/join/${qrRes.qrToken}`), `Expected link to end with short code: ${qrRes.joinLink}`);

  // 3. Test that resolving with the new short code works
  const newPreview = await service.previewJoin(applicant.id, qrRes.qrToken);
  assert.equal(newPreview.workplaceId, workplace.id);
  assert.equal(newPreview.workplaceName, 'Short Code Tech');

  // 4. Test that the old 64-char token (fc2034b7...) still resolves seamlessly for backward compatibility
  const legacyPreview = await service.previewJoin(applicant.id, legacyToken);
  assert.equal(legacyPreview.workplaceId, workplace.id);
  assert.equal(legacyPreview.workplaceName, 'Short Code Tech');

  // Also test URL format with old token
  const legacyUrlPreview = await service.previewJoin(applicant.id, `https://www.bizora.shivamshankhdhar.online/join/${legacyToken}`);
  assert.equal(legacyUrlPreview.workplaceId, workplace.id);
});
