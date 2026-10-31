import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { WorkplaceService } from '../src/modules/workplace/workplace.service';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { TeamModel } from '../src/modules/team/team.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { WorkplaceJoinRequestModel } from '../src/modules/workplace/workplace-join-request.model';
import { UserModel } from '../src/modules/auth/user.model';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { encryptToken } from '../src/utils/crypto';

const wpId = '11111111-1111-4111-a111-111111111111';
const teamId = '22222222-2222-4222-a222-222222222222';
const userId = '33333333-3333-4333-a333-333333333333';
const team = { _id: teamId, workplaceId: wpId, teamCode: 'TM12345', name: 'Engineering' };
function fixture() {
  const workplace: any = { _id: wpId, status: 'ACTIVE', name: 'Office', workplaceCode: 'BWP-1234-567', joinInviteToken: 'abc-123', joinInviteExpiresAt: new Date(Date.now() + 60000), joinQrSecret: 'secret' };
  const state = { workplace, created: [] as any[], rotations: 0, audits: [] as any[] };
  mock.method(WorkplaceModel, 'findById', async () => ({ ...workplace }));
  mock.method(WorkplaceModel, 'findOne', async (filter: any) => filter.joinInviteToken === workplace.joinInviteToken ? { ...workplace } : null);
  mock.method(WorkplaceModel, 'updateOne', async () => { state.rotations++; });
  mock.method(TeamModel, 'findOne', (filter: any) => filter.teamCode ? Promise.resolve(filter.teamCode === team.teamCode ? team : null) : { sort: async () => team });
  mock.method(TeamModel, 'findById', () => ({ select: async () => team }));
  mock.method(UserModel, 'findById', async () => ({ _id: userId, status: 'ACTIVE', name: 'Employee', email: 'employee@example.com' }));
  mock.method(WorkplaceMemberModel, 'findOne', async () => null);
  mock.method(WorkplaceMemberModel, 'create', async (data: any) => { state.created.push(data); return { ...data, _id: userId }; });
  mock.method(WorkplaceJoinRequestModel, 'updateMany', async () => ({}));
  mock.method(AuditLogModel, 'create', async (data: any) => { state.audits.push(data); });
  return state;
}
for (const token of ['TM12345', 'tm12345', 'https://bizora.example/join?token=TM12345&teamCode=TM12345', JSON.stringify({ teamCode: 'TM12345' })]) {
  test(`team code/link/QR assigns the same real team: ${token}`, async () => {
    const state = fixture();
    try {
      const service = new WorkplaceService();
      const preview = await service.publicJoinPreview(token);
      assert.equal(preview.targetTeam.id, teamId);
      const result = await service.submitJoinRequest(userId, { token });
      assert.equal(result.status, 'APPROVED');
      assert.equal(state.created[0].teamId, teamId);
      assert.equal(state.created[0].workplaceId, wpId);
      assert.equal(state.rotations, 0);
      assert.equal(state.audits[0].metadata.joinMethod, 'TEAM_CODE');
    } finally { mock.restoreAll(); }
  });
}
for (const token of ['BWP-1234-567', wpId, teamId, '111111', 'https://bizora.example/join?token=BWP-1234-567', 'https://bizora.example/join?token=expired&teamCode=TM12345']) {
  test(`rejects workplace identifiers and invalid token bypass: ${token}`, async () => {
    const state = fixture();
    try {
      await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token }), (e: any) => e.errorCode === 'TEAM_CODE_REQUIRED');
      assert.equal(state.created.length, 0);
    } finally { mock.restoreAll(); }
  });
}
for (const token of ['https://bizora.example/join/abc-123', 'bizora://join/abc-123?teamCode=TM12345', JSON.stringify({ token: 'abc-123', teamCode: 'TM12345' })]) {
  test(`valid invitation is consistent across link and QR: ${token}`, async () => {
    const state = fixture();
    const service = new WorkplaceService();
    mock.method(service as any, 'generateShortWorkplaceInviteCode', async () => 'new-123');
    try {
      assert.equal((await service.submitJoinRequest(userId, { token })).status, 'APPROVED');
      assert.equal(state.created[0].teamId, teamId);
      assert.equal(state.rotations, 1);
    } finally { mock.restoreAll(); }
  });
}
test('expired invite cannot be rescued by a valid team query parameter', async () => {
  const state = fixture(); state.workplace.joinInviteExpiresAt = new Date(0);
  try {
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token: 'https://bizora.example/join/abc-123?teamCode=TM12345' }), (e: any) => e.errorCode === 'EXPIRED_INVITE');
    assert.equal(state.created.length, 0);
  } finally { mock.restoreAll(); }
});
test('team hint must belong to the invitation workplace', async () => {
  fixture();
  mock.method(TeamModel, 'findOne', async (filter: any) => filter.teamCode === 'TM99999' ? { ...team, workplaceId: 'other-office' } : null);
  try {
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token: 'https://bizora.example/join/abc-123?teamCode=TM99999' }), (e: any) => e.errorCode === 'INVITE_TEAM_MISMATCH');
  } finally { mock.restoreAll(); }
});
test('disabled joining also rejects a valid team code', async () => {
  const state = fixture(); state.workplace.joinQrEnabled = false;
  try {
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token: 'TM12345' }), (e: any) => e.errorCode === 'JOIN_QR_DISABLED');
  } finally { mock.restoreAll(); }
});
test('existing member cannot silently join a different team', async () => {
  const state = fixture();
  mock.method(WorkplaceMemberModel, 'findOne', async (filter: any) => filter.status === 'ACTIVE' ? { _id: userId, teamId: 'other-team' } : null);
  try {
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token: 'TM12345' }), (e: any) => e.errorCode === 'ALREADY_IN_ANOTHER_TEAM');
    assert.equal(state.created.length, 0);
  } finally { mock.restoreAll(); }
});
test('encrypted QR tokens still require the current invite secret', async () => {
  fixture();
  try {
    const token = encryptToken(JSON.stringify({ type: 'WORKPLACE_JOIN', workplaceId: wpId, secret: 'rotated' }));
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token }), (e: any) => e.errorCode === 'EXPIRED_QR');
  } finally { mock.restoreAll(); }
});
test('employee invitation cannot be claimed by the wrong email account', async () => {
  const state = fixture();
  mock.method(WorkplaceMemberModel, 'findOne', async (filter: any) => filter.status === 'INVITED' ? { _id: userId, workplaceId: wpId, teamId, invitedEmail: 'someone-else@example.com' } : null);
  try {
    await assert.rejects(new WorkplaceService().submitJoinRequest(userId, { token: 'employee-token' }), (e: any) => e.errorCode === 'INVITE_EMAIL_MISMATCH');
    assert.equal(state.created.length, 0);
  } finally { mock.restoreAll(); }
});
