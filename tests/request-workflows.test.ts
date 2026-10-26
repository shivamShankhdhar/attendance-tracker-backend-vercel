import { AttendanceController } from '../src/modules/attendance/attendance.controller';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { localRequestInstant } from '../src/modules/attendance-request/request-time';
import { submitAttendanceRequestSchema } from '../src/modules/attendance-request/attendance-request.schema';
import { AttendanceRequestService } from '../src/modules/attendance-request/attendance-request.service';
import { prisma } from '../src/config/database';

const db: any = { $transaction: async () => null, workplaceMember: { findFirst: async () => null }, attendanceRequest: { findMany: async () => [] } };
const service = new AttendanceRequestService(db);
test('correction times use workplace timezone and reject nonexistent local times', () => {
  assert.equal(localRequestInstant('2026-10-26', '09:30', 'Asia/Kolkata').toISOString(), '2026-10-26T04:00:00.000Z');
  assert.equal(localRequestInstant('2026-10-26', '09:30', 'America/New_York').toISOString(), '2026-10-26T13:30:00.000Z');
  assert.throws(() => localRequestInstant('2026-03-08', '02:30', 'America/New_York'));
  assert.throws(() => localRequestInstant('2026-10-26', '25:30', 'Asia/Kolkata'));
});
test('request schema preserves leave type date time and reason, rejects impossible dates', () => {
  const body = { workplaceId: 'wp', source: 'MANUAL', requestType: 'SICK_LEAVE', attendanceDate: '2026-10-26', note: 'Unwell' };
  assert.equal(submitAttendanceRequestSchema.parse(body).requestType, 'SICK_LEAVE');
  assert.equal(submitAttendanceRequestSchema.parse(body).attendanceDate, '2026-10-26');
  assert.equal(submitAttendanceRequestSchema.safeParse({ ...body, attendanceDate: '2026-02-30' }).success, false);
});
test('leave approval writes leave without manufacturing check-in or check-out', async () => {
  let saved: any;
  const tx: any = {
    attendanceRequest: { findUnique: async () => ({ id: 'r', workplaceId: 'w', employeeMemberId: 'm', attendanceDate: '2026-10-26', requestType: 'SICK_LEAVE', status: 'PENDING', userId: 'u', note: 'Unwell' }), updateMany: async () => ({ count: 1 }) },
    workplace: { findUniqueOrThrow: async () => ({ timezone: 'Asia/Kolkata' }) },
    attendance: { findUnique: async () => null, upsert: async (args: any) => { saved = args.create; return saved; } },
    auditLog: { create: async () => ({}) },
  };
  mock.method(db, '$transaction', async (run: any) => run(tx));
  try {
    await service.approveManualRequest('w', 'r', 'owner');
    assert.equal(saved.status, 'LEAVE'); assert.equal(saved.checkInTime, null); assert.equal(saved.checkOutTime, null);
    assert.equal(saved.attendanceDate, '2026-10-26');
  } finally { mock.restoreAll(); }
});
test('leave approval refuses to overwrite a worked day', async () => {
  const tx: any = {
    attendanceRequest: { findUnique: async () => ({ id: 'r', workplaceId: 'w', employeeMemberId: 'm', attendanceDate: '2026-10-26', requestType: 'SICK_LEAVE', status: 'PENDING' }) },
    workplace: { findUniqueOrThrow: async () => ({ timezone: 'Asia/Kolkata' }) },
    attendance: { findUnique: async () => ({ checkInTime: new Date() }) },
  };
  mock.method(db, '$transaction', async (run: any) => run(tx));
  try { await assert.rejects(service.approveManualRequest('w', 'r', 'owner'), (e: any) => e.errorCode === 'ATTENDANCE_CONFLICT'); }
  finally { mock.restoreAll(); }
});
test('employee request history is scoped to the active membership', async () => {
  let where: any;
  mock.method(db.workplaceMember, 'findFirst', async () => ({ id: 'own-member', name: 'Employee', employeeCode: 'E1' }));
  mock.method(db.attendanceRequest, 'findMany', async (args: any) => { where = args.where; return []; });
  try { await service.getMyRequests('workplace', 'user'); assert.deepEqual(where, { workplaceId: 'workplace', employeeMemberId: 'own-member' }); }
  finally { mock.restoreAll(); }
});

test('paginated history forces employee scope and returns a stable newest-first cursor', async () => {
  let query: any, response: any;
  const records = Array.from({ length: 21 }, (_, i) => ({ id: String(30 - i), attendanceDate: '2026-10-26', employeeMember: { id: 'self', name: 'Alice', employeeCode: 'E1' } }));
  const controller = new AttendanceController({ attendance: { findMany: async (args: any) => { query = args; return records; } } } as any);
  const req: any = { params: { workplaceId: 'w' }, query: { startDate: '2026-10-01', endDate: '2026-10-26', memberId: 'other' },
    workplaceMember: { role: 'EMPLOYEE', _id: 'self' }, workplace: { attendanceSettings: {} } };
  await controller.getPage(req, { json: (value: any) => { response = value; } } as any, (e: any) => { throw e; });
  assert.equal(query.where.employeeMemberId, 'self'); assert.equal(query.take, 21);
  assert.deepEqual(query.orderBy, [{ attendanceDate: 'desc' }, { id: 'desc' }]);
  assert.equal(response.data.records.length, 20); assert.equal(response.data.nextCursor, '2026-10-26|11');
});
test('history policy is enforced before reading attendance pages', async () => {
  let error: any;
  const controller = new AttendanceController({} as any);
  await controller.getPage({ params: { workplaceId: 'w' }, query: {}, workplaceMember: { role: 'EMPLOYEE', _id: 'self' }, workplace: { attendanceSettings: { allowEmployeeViewHistory: false } } } as any,
    {} as any, (e: any) => { error = e; });
  assert.equal(error.errorCode, 'HISTORY_DISABLED');
});
