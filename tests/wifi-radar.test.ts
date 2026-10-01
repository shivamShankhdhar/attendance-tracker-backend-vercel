import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { UserModel } from '../src/modules/auth/user.model';
import { AttendanceModel } from '../src/modules/attendance/attendance.model';
import { AttendanceRequestModel } from '../src/modules/attendance-request/attendance-request.model';
import { AttendanceSessionModel } from '../src/modules/attendance-session/attendance-session.model';
import { workplaceService } from '../src/modules/workplace/workplace.service';
import { attendanceRequestService } from '../src/modules/attendance-request/attendance-request.service';

let mongo: MongoMemoryReplSet;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    WorkplaceModel.init(),
    WorkplaceMemberModel.init(),
    UserModel.init(),
    AttendanceModel.init(),
    AttendanceRequestModel.init(),
    AttendanceSessionModel.init(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('Wi-Fi Radar listening session flow: employer starts listening, employee submits via Wi-Fi, employer approves, and session stops', async () => {
  const employerId = new Types.ObjectId();
  const employer = await UserModel.create({
    _id: employerId,
    name: 'Radar Employer',
    email: `employer-${Date.now()}@radar.test`,
    status: 'ACTIVE',
  });

  const workplaceId = new Types.ObjectId();
  const workplace = await WorkplaceModel.create({
    _id: workplaceId,
    name: 'Radar Tech Hub',
    ownerId: employerId,
    timezone: 'Asia/Kolkata',
    wifiSsid: 'Office-HighSpeed-WiFi',
    status: 'ACTIVE',
  });

  await WorkplaceMemberModel.create({
    workplaceId: workplace._id,
    userId: employerId,
    role: 'EMPLOYER',
    name: employer.name,
    status: 'ACTIVE',
    joinedAt: new Date(),
  });

  const employeeId = new Types.ObjectId();
  const employee = await UserModel.create({
    _id: employeeId,
    name: 'Priya Radar Employee',
    email: `priya-${Date.now()}@radar.test`,
    status: 'ACTIVE',
  });

  const member = await WorkplaceMemberModel.create({
    workplaceId: workplace._id,
    userId: employeeId,
    role: 'EMPLOYEE',
    name: employee.name,
    employeeCode: 'EMP-9001',
    status: 'ACTIVE',
    joinedAt: new Date(),
  });

  // 1. Employer starts Wi-Fi radar listening mode
  const startResult = await workplaceService.startWifiRadar(workplace._id.toString(), employerId.toString(), {
    wifiSsid: 'Office-HighSpeed-WiFi',
  });
  assert.equal(startResult.session.isActive, true);
  assert.equal(startResult.session.wifiSsid, 'Office-HighSpeed-WiFi');

  // 2. Employee checks Wi-Fi radar status
  const status = await workplaceService.getWifiRadarStatus(workplace._id.toString());
  assert.equal(status.isActive, true);
  assert.equal(status.wifiSsid, 'Office-HighSpeed-WiFi');
  assert.equal(status.pendingCount, 0);

  // 3. Employee sends attendance request via Wi-Fi
  const reqRes = await attendanceRequestService.submitRequest(employeeId.toString(), {
    workplaceId: workplace._id.toString(),
    source: 'WIFI',
    wifiMode: true,
    deviceSsid: 'Office-HighSpeed-WiFi',
  });
  assert.equal(reqRes.request.status, 'PENDING');
  assert.equal(reqRes.request.verification.wifiVerified, true);

  // 4. Radar status now shows 1 pending request
  const statusAfterReq = await workplaceService.getWifiRadarStatus(workplace._id.toString());
  assert.equal(statusAfterReq.pendingCount, 1);

  // 5. Employer approves attendance request from Radar screen
  const approveResult = await attendanceRequestService.approveRequest(
    workplace._id.toString(),
    reqRes.request.id,
    employerId.toString()
  );
  assert.equal(approveResult.attendance.status, 'PRESENT');

  const updatedReq = await AttendanceRequestModel.findById(reqRes.request.id);
  assert.equal(updatedReq?.status, 'APPROVED');

  // 6. Verify Attendance is marked PRESENT in database
  const attendance = await AttendanceModel.findOne({
    workplaceId: workplace._id,
    employeeMemberId: member._id,
  });
  assert.ok(attendance, 'Attendance record must be created in DB');
  assert.equal(attendance.status, 'PRESENT');
  assert.equal(attendance.verification.wifi, true);

  // 7. Employer stops Wi-Fi radar listening mode
  const stopResult = await workplaceService.stopWifiRadar(workplace._id.toString(), employerId.toString());
  assert.equal(stopResult.isActive, false);

  const statusAfterStop = await workplaceService.getWifiRadarStatus(workplace._id.toString());
  assert.equal(statusAfterStop.isActive, false);
});
