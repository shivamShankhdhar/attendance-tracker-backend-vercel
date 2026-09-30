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
import { AppError } from '../src/middleware/errorHandler';
import { notificationService } from '../src/modules/notification/notification.service';

let mongo: MongoMemoryReplSet;
const service = new WorkplaceService();
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([WorkplaceModel.init(), WorkplaceJoinRequestModel.init(), WorkplaceMemberModel.init(), NotificationOutboxModel.init(), UserModel.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function fixture() {
  const owner = await UserModel.create({ name: 'Owner', status: 'ACTIVE' });
  const applicant = await UserModel.create({ name: 'Applicant', email: `${new mongoose.Types.ObjectId()}@join.test`, status: 'ACTIVE' });
  const { workplace } = await service.createWorkplace(owner.id, { name: 'Invitation tests', address: 'Mumbai', description: 'Team attendance' });
  const link = await service.getJoinQr(workplace.id);
  return { owner, applicant, workplace, link };
}
test('stable path invite resolves; rotation and disabled joining reject old tokens', async () => {
  const { owner, applicant, workplace, link } = await fixture();
  assert.equal((await service.getJoinQr(workplace.id)).joinLink, link.joinLink);
  assert.ok(new URL(link.joinLink).pathname.endsWith(`/join/${link.qrToken}`));
  const preview = await service.previewJoin(applicant.id, link.joinLink);
  assert.equal(preview.workplaceId, workplace.id);
  assert.equal(preview.description, 'Team attendance');
  assert.equal(preview.ownerName, 'Owner');
  const next = await service.rotateJoinQr(workplace.id, owner.id);
  assert.notEqual(next.qrToken, link.qrToken);
  await assert.rejects(service.previewJoin(applicant.id, link.qrToken));
  await WorkplaceModel.updateOne({ _id: workplace.id }, { $set: { joinQrEnabled: false } });
  await assert.rejects(service.submitJoinRequest(applicant.id, { token: next.qrToken }), (e: AppError) => e.errorCode === 'JOIN_QR_DISABLED');
});
test('request is idempotent, rejection persists across reopen, and history is user-scoped after link rotation', async () => {
  const { owner, applicant, workplace, link } = await fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => service.submitJoinRequest(applicant.id, { token: link.qrToken })));
  assert.equal(new Set(results.map((r) => r.requestId)).size, 1);
  const id = results[0].requestId;
  assert.equal(await NotificationOutboxModel.countDocuments({ eventId: `join:${id}:pending` }), 1);
  await service.rejectJoinRequest(workplace.id, owner.id, id, { reason: 'Please contact HR' });
  const preview = await service.previewJoin(applicant.id, link.qrToken);
  assert.equal(preview.latestRequest?.status, 'REJECTED');
  assert.equal(preview.latestRequest?.rejectionReason, 'Please contact HR');
  assert.equal(preview.pendingRequest, null);
  assert.equal(await WorkplaceMemberModel.countDocuments({ workplaceId: workplace.id, userId: applicant.id }), 0);
  await service.rotateJoinQr(workplace.id, owner.id);
  assert.equal((await service.getMyJoinRequest(applicant.id, id)).latestRequest.status, 'REJECTED');
  await assert.rejects(service.getMyJoinRequest(owner.id, id), (e: AppError) => e.statusCode === 404);
});
test('approval and rejection race commits exactly one decision and corresponding membership', async () => {
  const { owner, applicant, workplace, link } = await fixture();
  const { requestId } = await service.submitJoinRequest(applicant.id, { token: link.qrToken });
  const results = await Promise.allSettled([
    service.approveJoinRequest(workplace.id, owner.id, requestId),
    service.rejectJoinRequest(workplace.id, owner.id, requestId),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const request = await WorkplaceJoinRequestModel.findById(requestId).orFail();
  assert.equal(await WorkplaceMemberModel.countDocuments({ workplaceId: workplace.id, userId: applicant.id, status: 'ACTIVE' }), request.status === 'APPROVED' ? 1 : 0);
  assert.equal(await NotificationOutboxModel.countDocuments({ recipientId: applicant.id, kind: { $in: ['JOIN_APPROVED', 'JOIN_REJECTED'] } }), 1);
});
test('approval supplies active membership and persists a notification without a registered device', async () => {
  const { owner, applicant, workplace, link } = await fixture();
  const { requestId } = await service.submitJoinRequest(applicant.id, { token: link.qrToken });
  await service.approveJoinRequest(workplace.id, owner.id, requestId);
  const details = await service.getMyJoinRequest(applicant.id, requestId);
  assert.equal(details.latestRequest.status, 'APPROVED');
  assert.equal(details.alreadyMember, true);
  const memberships = await service.getMyWorkplaces(applicant.id);
  assert.equal(memberships[0].role, 'EMPLOYEE');
  await notificationService.processPendingOutbox(5, requestId);
  assert.equal((await NotificationOutboxModel.findOne({ eventId: `join:${requestId}:approved` }))?.status, 'PENDING');
});
test('cancelling cannot overwrite an approved membership decision', async () => {
  const { owner, applicant, workplace, link } = await fixture();
  const { requestId } = await service.submitJoinRequest(applicant.id, { token: link.qrToken });
  await service.approveJoinRequest(workplace.id, owner.id, requestId);
  await assert.rejects(service.cancelMyJoinRequest(applicant.id, requestId), (e: AppError) => e.statusCode === 409);
  assert.equal((await service.getMyJoinRequest(applicant.id, requestId)).latestRequest.status, 'APPROVED');
});
