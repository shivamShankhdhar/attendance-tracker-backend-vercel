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
  if ((WorkplaceModel as any).init) {
    await Promise.all([
      (WorkplaceModel as any).init?.(),
      (WorkplaceJoinRequestModel as any).init?.(),
      (WorkplaceMemberModel as any).init?.(),
      (NotificationOutboxModel as any).init?.(),
      (UserModel as any).init?.(),
    ]);
  }
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
  assert.equal(preview.canJoinDirectly, true);
  assert.equal(preview.pendingRequest, null);
  const next = await service.rotateJoinQr(workplace.id, owner.id);
  assert.notEqual(next.qrToken, link.qrToken);
  await assert.rejects(service.previewJoin(applicant.id, link.qrToken));
  await WorkplaceModel.updateOne({ _id: workplace.id }, { $set: { joinQrEnabled: false } });
  await assert.rejects(service.submitJoinRequest(applicant.id, { token: next.qrToken }), (e: AppError) => e.errorCode === 'JOIN_QR_DISABLED');
});
test('joining with invite link auto-approves directly with no approval needed', async () => {
  const { applicant, workplace, link } = await fixture();
  const joinResult = await service.submitJoinRequest(applicant.id, { token: link.qrToken });
  assert.equal(joinResult.status, 'APPROVED');
  assert.equal(joinResult.autoApproved, true);
  assert.equal(joinResult.alreadyMember, true);
  assert.equal(joinResult.workplaceId, workplace.id);

  // Active membership must exist
  const member = await WorkplaceMemberModel.findOne({ workplaceId: workplace.id, userId: applicant.id, status: 'ACTIVE' });
  assert.ok(member, 'Applicant must be an active member');
  assert.equal(member.status, 'ACTIVE');

  // After joining, applicant is an active member of the workplace
  const myWorkplaces = await service.getMyWorkplaces(applicant.id);
  assert.equal(myWorkplaces.length, 1);
  assert.equal(myWorkplaces[0].id, workplace.id);
  assert.equal(myWorkplaces[0].role, 'EMPLOYEE');
});

test('manually added employee receives join link, sees preview as invited, and joins directly with no approval needed', async () => {
  const { owner, workplace, link } = await fixture();
  const { employeeService } = await import('../src/modules/employee/employee.service');

  const empEmail = `invited-${Date.now()}@join.test`;
  const addResult = await employeeService.addEmployee(workplace.id, owner.id, {
    name: 'Rahul Employee',
    email: empEmail,
  });

  assert.ok(addResult.joinLink, 'addEmployee must generate and return a joinLink');
  assert.ok(addResult.inviteToken, 'addEmployee must generate an inviteToken');
  assert.equal(addResult.employee.invitedEmail, empEmail);
  assert.equal(addResult.employee.status, 'INVITED');

  // Candidate user signs up / signs in with Google using that email
  const candidateUser = await UserModel.create({
    name: 'Rahul Employee',
    email: empEmail,
    status: 'ACTIVE',
  });

  // Preview the workplace using the generated workplace join link
  const preview = await service.previewJoin(candidateUser.id, addResult.joinLink);
  assert.equal(preview.workplaceId, workplace.id);
  assert.equal(preview.isInvited, true, 'previewJoin must recognize user is an invited employee');
  assert.equal(preview.alreadyMember, false);

  // Preview using the personal invite token
  const tokenPreview = await service.previewJoin(candidateUser.id, addResult.inviteToken);
  assert.equal(tokenPreview.workplaceId, workplace.id);
  assert.equal(tokenPreview.isInvited, true);

  // Candidate clicks to join: should be auto-approved immediately without requiring employer approval!
  const joinResult = await service.submitJoinRequest(candidateUser.id, { token: addResult.joinLink });
  assert.equal(joinResult.status, 'APPROVED');
  assert.equal(joinResult.alreadyMember, true);
  assert.equal(joinResult.autoApproved, true);

  // Verify membership in DB is ACTIVE
  const activeMember = await WorkplaceMemberModel.findOne({
    workplaceId: workplace.id,
    userId: candidateUser.id,
    status: 'ACTIVE',
  });
  assert.ok(activeMember, 'Candidate should now be an active member of the workplace');
  assert.equal(activeMember.role, 'EMPLOYEE');
});
