import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { UserModel } from '../src/modules/auth/user.model';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { AttendanceSessionModel } from '../src/modules/attendance-session/attendance-session.model';
import { AttendanceRequestModel } from '../src/modules/attendance-request/attendance-request.model';
import { AttendanceModel } from '../src/modules/attendance/attendance.model';
import { WorkplaceJoinRequestModel } from '../src/modules/workplace/workplace-join-request.model';
import { MongoMemoryServer } from 'mongodb-memory-server';

let server: http.Server;
let baseUrl: string;
let mongod: MongoMemoryServer | null = null;

function makeRequest(path: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = options.body ? JSON.stringify(options.body) : null;
    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 200, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 200, body: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

describe('Attendance Management System — End-to-End API Suite', () => {
  before(async () => {
    try {
      await connectDatabase();
    } catch {
      console.log('[Test Suite] Remote MongoDB unavailable. Starting in-memory MongoDB server...');
      mongod = await MongoMemoryServer.create();
      await connectDatabase(mongod.getUri());
    }

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up test data created with test prefix
    try {
      await UserModel.deleteMany({ email: { $regex: /@test-suite\.local$/ } });
      await WorkplaceModel.deleteMany({ name: { $regex: /^Test Workplace/ } });
    } catch {}
    await disconnectDatabase();
    if (mongod) {
      await mongod.stop();
    }
  });

  let employerToken: string;
  let employerUserId: string;
  let workplaceId: string;
  let employeeToken: string;
  let employeeUserId: string;
  let employeeMemberId: string;
  let employeeCode: string;
  let activeQrToken: string;
  let attendanceRequestId: string;

  test('1. Health check returns healthy status', async () => {
    const res = await makeRequest('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
  });

  test('2. Employer signs in with Google (dev mock profile) and creates a workplace', async () => {
    const authRes = await makeRequest('/api/v1/auth/google/exchange', {
      method: 'POST',
      body: {
        idToken: 'mock-id-token',
        devMockProfile: {
          googleSub: 'google_sub_employer_001',
          email: 'employer@test-suite.local',
          name: 'Vikram Boss',
        },
      },
    });

    assert.equal(authRes.status, 200);
    assert.ok(authRes.body.data.accessToken);
    employerToken = authRes.body.data.accessToken;
    employerUserId = authRes.body.data.user.id;

    // Create workplace
    const wpRes = await makeRequest('/api/v1/workplaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
      body: {
        name: 'Test Workplace Central',
        timezone: 'Asia/Kolkata',
        address: '101 MG Road, Bengaluru',
        wifiSsid: 'TEST_OFFICE_WIFI',
      },
    });

    assert.equal(wpRes.status, 201);
    assert.equal(wpRes.body.data.workplace.name, 'Test Workplace Central');
    assert.equal(wpRes.body.data.member.role, 'EMPLOYER');
    workplaceId = wpRes.body.data.workplace._id;
  });

  test('3. Employer adds an employee with email and PIN fallback', async () => {
    const addEmpRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/employees`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
      body: {
        name: 'Aarav Staff',
        email: 'aarav@test-suite.local',
        pin: '1234',
      },
    });

    assert.equal(addEmpRes.status, 201);
    assert.equal(addEmpRes.body.data.employee.name, 'Aarav Staff');
    assert.ok(addEmpRes.body.data.employee.employeeCode);
    assert.equal(addEmpRes.body.data.employee.hasPin, true);
    employeeMemberId = addEmpRes.body.data.employee.id;
    employeeCode = addEmpRes.body.data.employee.employeeCode;
  });

  test('4. Employee logs in via PIN fallback using Employee Code + PIN', async () => {
    const pinLoginRes = await makeRequest('/api/v1/auth/employee-pin-login', {
      method: 'POST',
      body: {
        workplaceId,
        employeeCode,
        pin: '1234',
      },
    });

    assert.equal(pinLoginRes.status, 200);
    assert.ok(pinLoginRes.body.data.accessToken);
    employeeToken = pinLoginRes.body.data.accessToken;
    employeeUserId = pinLoginRes.body.data.user.id;
  });

  test('5. Employer opens today attendance session and receives secure QR token', async () => {
    const sessionRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance-sessions/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
    });

    assert.equal(sessionRes.status, 200);
    assert.ok(sessionRes.body.data.qrToken);
    assert.ok(sessionRes.body.data.qrPayload.startsWith('attendance://checkin?token='));
    activeQrToken = sessionRes.body.data.qrToken;

    // Opening session again returns identical QR token idempotently
    const reOpenRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance-sessions/open`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
    });
    assert.equal(reOpenRes.status, 200);
    assert.equal(reOpenRes.body.data.qrToken, activeQrToken);
  });

  test('6. Rule 1: Employee scans QR and submits attendance request (Attendance is NOT marked yet)', async () => {
    const reqRes = await makeRequest('/api/v1/attendance/requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: {
        qrToken: activeQrToken,
        deviceSsid: 'TEST_OFFICE_WIFI', // Wi-Fi matches
      },
    });

    assert.equal(reqRes.status, 200);
    assert.equal(reqRes.body.data.request.status, 'PENDING');
    assert.equal(reqRes.body.data.request.verification.qrVerified, true);
    assert.equal(reqRes.body.data.request.verification.wifiVerified, true);
    attendanceRequestId = reqRes.body.data.request.id;

    // Verify Attendance record does NOT exist yet
    const attendanceCheck = await AttendanceModel.findOne({
      workplaceId,
      employeeMemberId,
    });
    assert.equal(attendanceCheck, null, 'Rule 1 violation: Attendance must not be created before employer approval!');
  });

  test('7. Duplicate scan on same day is idempotent and returns existing pending request', async () => {
    const dupRes = await makeRequest('/api/v1/attendance/requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: {
        qrToken: activeQrToken,
      },
    });

    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.body.data.request.id, attendanceRequestId);
    assert.equal(dupRes.body.data.request.status, 'PENDING');
  });

  test('8. Employer views pending requests and sees employee request', async () => {
    const listRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance/requests?status=PENDING`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${employerToken}` },
    });

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data));
    assert.ok(listRes.body.data.length >= 1);
    const found = listRes.body.data.find((r: any) => r.id === attendanceRequestId);
    assert.ok(found);
    assert.equal(found.status, 'PENDING');
    assert.equal(found.employee.name, 'Aarav Staff');
  });

  test('9. Employer approves attendance request: Attendance is atomically created and marked PRESENT', async () => {
    const approveRes = await makeRequest(
      `/api/v1/workplaces/${workplaceId}/attendance/requests/${attendanceRequestId}/approve`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${employerToken}` },
      }
    );

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.attendance.status, 'PRESENT');

    // Rule 9: Idempotent repeat approval returns existing attendance
    const repeatRes = await makeRequest(
      `/api/v1/workplaces/${workplaceId}/attendance/requests/${attendanceRequestId}/approve`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${employerToken}` },
      }
    );
    assert.equal(repeatRes.status, 200);
    assert.equal(repeatRes.body.data.attendance.status, 'PRESENT');

    // Rule 2: Verify exactly ONE attendance record in database
    const totalRecords = await AttendanceModel.countDocuments({
      workplaceId,
      employeeMemberId,
    });
    assert.equal(totalRecords, 1, 'Rule 2 violation: Duplicate attendance records found!');
  });

  test('10. Today roster displays employee as PRESENT with check-in timestamp', async () => {
    const rosterRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance/today`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${employerToken}` },
    });

    assert.equal(rosterRes.status, 200);
    assert.equal(rosterRes.body.data.counts.presentCount, 1);
    assert.equal(rosterRes.body.data.counts.pendingCount, 0);

    const empRoster = rosterRes.body.data.roster.find((r: any) => r.memberId === employeeMemberId);
    assert.ok(empRoster);
    assert.equal(empRoster.status, 'PRESENT');
    assert.ok(empRoster.checkInTime);
  });

  test('11. Employer manual attendance adjustment with audit trail', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const manualRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance/manual`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
      body: {
        employeeMemberId,
        attendanceDate: today,
        status: 'HALF_DAY',
        correctionReason: 'Left early for doctor appointment with permission',
      },
    });

    assert.equal(manualRes.status, 200);
    assert.equal(manualRes.body.data.attendance.status, 'HALF_DAY');
    assert.equal(manualRes.body.data.attendance.source, 'MANUAL');
  });

  test('12. Employer closes attendance session; subsequent scan attempts are rejected', async () => {
    const closeRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/attendance-sessions/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employerToken}` },
    });
    assert.equal(closeRes.status, 200);

    // Scan should now be rejected as session is closed
    const scanClosedRes = await makeRequest('/api/v1/attendance/requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken}` },
      body: {
        qrToken: activeQrToken,
      },
    });
    assert.equal(scanClosedRes.status, 400);
    assert.equal(scanClosedRes.body.error.code, 'SESSION_CLOSED_OR_EXPIRED');
  });
  test('13. PIN-only users receive only their own memberships and logout revokes refresh', async () => {
    const added = await makeRequest(`/api/v1/workplaces/${workplaceId}/employees`, {
      method: 'POST', headers: { Authorization: `Bearer ${employerToken}` },
      body: { name: 'Test PIN-only employee', employeeCode: 'PINONLY', pin: '5831' },
    });
    assert.equal(added.status, 201);
    const login = await makeRequest('/api/v1/auth/employee-pin-login', {
      method: 'POST', body: { workplaceId, employeeCode: 'PINONLY', pin: '5831' },
    });
    assert.equal(login.status, 200);
    const session = login.body.data;
    try {
      assert.equal(session.memberships.length, 1);
      assert.equal(session.memberships[0].id, added.body.data.employee.id);
      assert.equal(session.memberships[0].role, 'EMPLOYEE');
      const forbidden = await makeRequest(`/api/v1/workplaces/${workplaceId}/employees`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      assert.equal(forbidden.status, 403);
      const logout = await makeRequest('/api/v1/auth/logout', {
        method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      assert.equal(logout.status, 200);
      const refresh = await makeRequest('/api/v1/auth/refresh', {
        method: 'POST', body: { refreshToken: session.refreshToken },
      });
      assert.equal(refresh.status, 401);
    } finally {
      await WorkplaceMemberModel.deleteOne({ _id: added.body.data.employee.id });
      await UserModel.deleteOne({ _id: session.user.id });
    }
  });

  test('14. Full QR join workspace flow: Employer generates Join QR -> Candidate scans & previews details -> Candidate submits join request -> Employer reviews & approves -> Candidate becomes active employee', async () => {
    // 1. Create a candidate user account via dev mock exchange
    const candidateAuthRes = await makeRequest('/api/v1/auth/google/exchange', {
      method: 'POST',
      body: {
        idToken: 'mock-id-token',
        devMockProfile: {
          googleSub: 'candidate_qr_user_1',
          name: 'Ananya Roy',
          email: 'ananya.roy@test-suite.local',
          picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        },
      },
    });
    assert.equal(candidateAuthRes.status, 200);
    const candidateToken = candidateAuthRes.body.data.accessToken;
    const candidateUserId = candidateAuthRes.body.data.user.id;

    // 2. Employer requests Workplace Join QR code
    const joinQrRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/join-qr`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${employerToken}` },
    });
    assert.equal(joinQrRes.status, 200);
    assert.ok(joinQrRes.body.data.qrToken);
    assert.ok(joinQrRes.body.data.qrPayload.startsWith('attendance://join?'));
    const joinQrToken = joinQrRes.body.data.qrToken;

    // 3. Candidate scans QR code and previews workplace & employer details
    const previewRes = await makeRequest('/api/v1/workplaces/join-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` },
      body: { token: joinQrToken },
    });
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.data.workplaceId, workplaceId);
    assert.equal(previewRes.body.data.alreadyMember, false);
    assert.equal(previewRes.body.data.pendingRequest, null);
    assert.ok(previewRes.body.data.workplaceName);
    assert.ok(previewRes.body.data.ownerName);

    // 4. Candidate confirms details and submits join request
    const joinReqRes = await makeRequest('/api/v1/workplaces/join-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` },
      body: {
        token: joinQrToken,
        note: 'Joining as front desk receptionist',
      },
    });
    assert.equal(joinReqRes.status, 201);
    assert.equal(joinReqRes.body.data.status, 'PENDING');
    const requestId = joinReqRes.body.data.requestId;

    // 5. Candidate checking my-join-requests sees pending status
    const myRequestsRes = await makeRequest('/api/v1/workplaces/my-join-requests', {
      method: 'GET',
      headers: { Authorization: `Bearer ${candidateToken}` },
    });
    assert.equal(myRequestsRes.status, 200);
    const foundMyReq = myRequestsRes.body.data.find((r: any) => r.id === requestId);
    assert.ok(foundMyReq);
    assert.equal(foundMyReq.status, 'PENDING');

    // 6. Duplicate join request is idempotent and returns existing request
    const dupJoinRes = await makeRequest('/api/v1/workplaces/join-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${candidateToken}` },
      body: { token: joinQrToken },
    });
    assert.equal(dupJoinRes.status, 201);
    assert.equal(dupJoinRes.body.data.requestId, requestId);

    // 7. Employer views workplace join requests and sees Ananya's request
    const employerRequestsRes = await makeRequest(`/api/v1/workplaces/${workplaceId}/join-requests?status=PENDING`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${employerToken}` },
    });
    assert.equal(employerRequestsRes.status, 200);
    const candidateReq = employerRequestsRes.body.data.find((r: any) => r.id === requestId);
    assert.ok(candidateReq);
    assert.equal(candidateReq.name, 'Ananya Roy');
    assert.equal(candidateReq.email, 'ananya.roy@test-suite.local');
    assert.equal(candidateReq.note, 'Joining as front desk receptionist');

    // 8. Employer approves the join request
    const approveRes = await makeRequest(
      `/api/v1/workplaces/${workplaceId}/join-requests/${requestId}/approve`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${employerToken}` },
        body: { employeeCode: 'EMP-ANANYA' },
      }
    );
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.data.employeeCode, 'EMP-ANANYA');

    // 9. Candidate now checks workplace list and is an ACTIVE EMPLOYEE
    const candidateWorkplacesRes = await makeRequest('/api/v1/workplaces', {
      method: 'GET',
      headers: { Authorization: `Bearer ${candidateToken}` },
    });
    assert.equal(candidateWorkplacesRes.status, 200);
    const joinedWp = candidateWorkplacesRes.body.data.find((w: any) => w.id === workplaceId);
    assert.ok(joinedWp);
    assert.equal(joinedWp.role, 'EMPLOYEE');
    assert.equal(joinedWp.employeeCode, 'EMP-ANANYA');

    // 10. Clean up test records
    await WorkplaceJoinRequestModel.deleteMany({ workplaceId });
    await WorkplaceMemberModel.deleteMany({ userId: candidateUserId });
    await UserModel.deleteMany({ _id: candidateUserId });
  });

});

