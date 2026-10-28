import { prisma } from '../src/config/database';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/modules/auth/auth.service';
import { AttendanceRequestService } from '../src/modules/attendance-request/attendance-request.service';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { AttendanceSessionModel } from '../src/modules/attendance-session/attendance-session.model';
import { AttendanceModel } from '../src/modules/attendance/attendance.model';
import { AttendanceRequestModel } from '../src/modules/attendance-request/attendance-request.model';
import { AuditLogModel } from '../src/modules/audit/audit.model';
import { NotificationOutboxModel } from '../src/modules/notification/notification.model';

const id = '111111111111111111111111';
const workplace: any = { _id: id, id, name: 'Test', status: 'ACTIVE', ownerId: id, timezone: 'Asia/Kolkata', attendanceSettings: { requireGeofence: true, latitude: 28.628, longitude: 77.3649, geofenceRadius: 150 } };
const db: any = { attendanceRequest: { upsert: async () => ({}) }, attendance: { findUnique: async () => null } };
const service = new AttendanceRequestService(db);
function fixture() {
  mock.method(WorkplaceModel, 'findById', async () => workplace);
  mock.method(AttendanceSessionModel, 'findOne', async () => ({ _id: id, id }));
  mock.method(WorkplaceMemberModel, 'findOne', async () => ({ _id: id, id, name: 'Employee' }));
  mock.method(AttendanceModel, 'findOne', async () => null);
  mock.method(AttendanceRequestModel, 'findOne', async () => null);
}
test('fabricated Google identity is rejected even with a mock profile', async () => {
  await assert.rejects(new AuthService().exchangeGoogleToken({ idToken: 'android-google-oauth-fake', devMockProfile: { email: 'fake@example.com', name: 'Fake', googleSub: 'fake' } }), (e: any) => e.errorCode === 'GOOGLE_AUTH_FAILED');
});
test('GEOFENCE source cannot bypass missing coordinates', async () => {
  fixture();
  try { await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE' }), (e: any) => e.errorCode === 'LOCATION_REQUIRED'); }
  finally { mock.restoreAll(); }
});
test('DIRECT source cannot bypass an enforced geofence', async () => {
  fixture();
  try { await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'DIRECT', latitude: 0, longitude: 0 }), (e: any) => e.errorCode === 'OUTSIDE_GEOFENCE'); }
  finally { mock.restoreAll(); }
});
test('unassociated user cannot punch', async () => {
  fixture(); mock.method(WorkplaceMemberModel, 'findOne', async () => null);
  try { await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'DIRECT' }), (e: any) => e.errorCode === 'NOT_WORKPLACE_EMPLOYEE'); }
  finally { mock.restoreAll(); }
});
test('checkout without checkin is rejected', async () => {
  fixture();
  try { await assert.rejects(service.submitRequest(id, { workplaceId: id, requestType: 'CHECK_OUT' }), (e: any) => e.errorCode === 'NO_CHECK_IN_FOUND'); }
  finally { mock.restoreAll(); }
});
test('verified checkin writes attendance for the same member and workplace', async () => {
  fixture();
  let stored: any;
  mock.method(db.attendanceRequest, 'upsert', async (args: any) => ({ ...args.create, id }));
  mock.method(db.attendance, 'findUnique', async () => ({ id, checkInTime: new Date() }));
  mock.method(AttendanceModel, 'findOneAndUpdate', async (filter: any, update: any) => { stored = { filter, update }; return { _id: id }; });
  mock.method(AuditLogModel, 'create', async () => ({}));
  mock.method(NotificationOutboxModel, 'create', async () => ({}));
  try {
    const result = await service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', latitude: 28.628, longitude: 77.3649, accuracy: 10 });
    assert.equal(result.request?.status, 'APPROVED');
    assert.equal(stored.filter.workplaceId, id);
    assert.equal(stored.filter.employeeMemberId, id);
    assert.equal(stored.update.$setOnInsert.status, 'PRESENT');
    assert.ok(stored.update.$setOnInsert.checkInTime instanceof Date);
  } finally { mock.restoreAll(); }
});

test('verified checkin recovers and succeeds even when attendanceRequest upsert fails', async () => {
  fixture();
  let stored: any;
  (db.attendanceRequest as any).findFirst = async () => null;
  (db.attendanceRequest as any).create = async (args: any) => ({ ...args.data, id });
  mock.method(db.attendanceRequest, 'upsert', async () => {
    throw new Error('there is no unique or exclusion constraint matching the ON CONFLICT specification');
  });
  mock.method(db.attendance, 'findUnique', async () => ({ id, checkInTime: new Date() }));
  mock.method(AttendanceModel, 'findOneAndUpdate', async (filter: any, update: any) => { stored = { filter, update }; return { _id: id }; });
  mock.method(AuditLogModel, 'create', async () => ({}));
  mock.method(NotificationOutboxModel, 'create', async () => ({}));
  try {
    const result = await service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', latitude: 28.628, longitude: 77.3649, accuracy: 10 });
    assert.equal(result.request?.status, 'APPROVED');
    assert.equal(stored.filter.workplaceId, id);
    assert.equal(stored.filter.employeeMemberId, id);
  } finally { mock.restoreAll(); }
});

for (const requestType of ['CHECK_IN', 'CHECK_OUT'] as const) {
  test(`${requestType} outside the saved office is rejected without writing attendance`, async () => {
    fixture();
    if (requestType === 'CHECK_OUT') mock.method(AttendanceModel, 'findOne', async () => ({ _id: id, checkInTime: new Date() }));
    let writes = 0;
    mock.method(AttendanceRequestModel, 'create', async () => { writes++; return {}; });
    mock.method(AttendanceModel, 'findOneAndUpdate', async () => { writes++; return {}; });
    try {
      await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', requestType, latitude: 0, longitude: 0, accuracy: 10 }), (e: any) => e.errorCode === 'OUTSIDE_GEOFENCE');
      assert.equal(writes, 0);
    } finally { mock.restoreAll(); }
  });
  test(`${requestType} rejects inaccurate GPS even at office coordinates`, async () => {
    fixture();
    if (requestType === 'CHECK_OUT') mock.method(AttendanceModel, 'findOne', async () => ({ _id: id, checkInTime: new Date() }));
    try {
      await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', requestType, latitude: 28.628, longitude: 77.3649, accuracy: 500 }), (e: any) => e.errorCode === 'LOCATION_INACCURATE');
    } finally { mock.restoreAll(); }
  });
  test(`${requestType} accepts realistic indoor GPS accuracy (e.g. 75m) within office geofence`, async () => {
    fixture();
    if (requestType === 'CHECK_OUT') mock.method(AttendanceModel, 'findOne', async () => ({ _id: id, checkInTime: new Date() }));
    mock.method(db.attendanceRequest, 'upsert', async (args: any) => ({ ...args.create, id }));
    mock.method(db.attendance, 'findUnique', async () => ({ id, checkInTime: new Date() }));
    mock.method(AttendanceModel, 'findOneAndUpdate', async () => ({ _id: id }));
    mock.method(AuditLogModel, 'create', async () => ({}));
    mock.method(NotificationOutboxModel, 'create', async () => ({}));
    try {
      const res = await service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', requestType, latitude: 28.628, longitude: 77.3649, accuracy: 75 });
      assert.equal(res.request?.status, 'APPROVED');
      assert.equal(res.geofenceVerified, true);
    } finally { mock.restoreAll(); }
  });
}
test('DIRECT still enforces office radius when requireGeofence is disabled', async () => {
  fixture();
  mock.method(WorkplaceModel, 'findById', async () => ({ ...workplace, attendanceSettings: { ...workplace.attendanceSettings, requireGeofence: false } }));
  try {
    await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'DIRECT', latitude: 0, longitude: 0, accuracy: 10 }), (e: any) => e.errorCode === 'OUTSIDE_GEOFENCE');
  } finally { mock.restoreAll(); }
});
test('missing office coordinates reject direct punches', async () => {
  fixture();
  mock.method(WorkplaceModel, 'findById', async () => ({ ...workplace, attendanceSettings: {} }));
  try {
    await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'DIRECT', latitude: 28.628, longitude: 77.3649, accuracy: 10 }), (e: any) => e.errorCode === 'OFFICE_LOCATION_NOT_CONFIGURED');
  } finally { mock.restoreAll(); }
});

test('fresh verified office punch resolves a previous pending request', async () => {
  fixture();
  mock.method(AttendanceRequestModel, 'findOne', async () => ({ _id: id, status: 'PENDING' }));
  let update: any;
  mock.method(db.attendanceRequest, 'upsert', async (args: any) => { update = args.update; return { ...args.create, id }; });
  mock.method(db.attendance, 'findUnique', async () => ({ id, checkInTime: new Date() }));
  mock.method(AttendanceModel, 'findOneAndUpdate', async () => ({ _id: id }));
  mock.method(AuditLogModel, 'create', async () => ({}));
  mock.method(NotificationOutboxModel, 'create', async () => ({}));
  try {
    const result = await service.submitRequest(id, { workplaceId: id, source: 'GEOFENCE', latitude: 28.628, longitude: 77.3649, accuracy: 10 });
    assert.equal(update.status, 'APPROVED');
    assert.equal(result.request?.status, 'APPROVED');
    assert.ok(result.attendance);
  } finally { mock.restoreAll(); }
});

for (const source of ['DIRECT', 'GEOFENCE'] as const) {
  for (const requestType of ['CHECK_IN', 'CHECK_OUT'] as const) {
    for (const deviceSsid of [undefined, 'Other network']) {
      test(`${source} ${requestType} succeeds at office without office Wi-Fi (${deviceSsid ?? 'no SSID'})`, async () => {
        fixture();
        mock.method(WorkplaceModel, 'findById', async () => ({ ...workplace, wifiSsid: 'Office', attendanceSettings: { ...workplace.attendanceSettings, requireWifi: true } }));
        if (requestType === 'CHECK_OUT') mock.method(AttendanceModel, 'findOne', async () => ({ _id: id, checkInTime: new Date() }));
        mock.method(db.attendanceRequest, 'upsert', async (args: any) => ({ ...args.create, id }));
        mock.method(db.attendance, 'findUnique', async () => ({ id, checkInTime: new Date() }));
        let writes = 0;
        mock.method(AttendanceModel, 'findOneAndUpdate', async () => { writes++; return { _id: id }; });
        mock.method(NotificationOutboxModel, 'create', async () => ({}));
        try {
          const result = await service.submitRequest(id, { workplaceId: id, source, requestType, deviceSsid, latitude: 28.628, longitude: 77.3649, accuracy: 10 });
          assert.equal(result.request?.status, 'APPROVED');
          assert.equal(result.request?.verification.geofenceVerified, true);
          assert.equal(result.request?.verification.wifiVerified, null);
          assert.equal(writes, 1);
        } finally { mock.restoreAll(); }
      });
    }
  }
}

test('QR attendance retains the configured Wi-Fi requirement', async () => {
  fixture();
  mock.method(WorkplaceModel, 'findById', async () => ({ ...workplace, wifiSsid: 'Office', attendanceSettings: { ...workplace.attendanceSettings, requireWifi: true } }));
  mock.method(AttendanceSessionModel, 'findOne', async () => ({ _id: id, id, workplaceId: id, status: 'OPEN', expiresAt: new Date(Date.now() + 60000), attendanceDate: '2026-10-28' }));
  try {
    await assert.rejects(service.submitRequest(id, { workplaceId: id, source: 'QR', qrToken: 'valid-session-token', latitude: 28.628, longitude: 77.3649, accuracy: 10 }), (e: any) => e.errorCode === 'WIFI_REQUIRED');
  } finally { mock.restoreAll(); }
});
