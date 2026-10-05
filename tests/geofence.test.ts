import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { UserModel } from '../src/modules/auth/user.model';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { AttendanceRequestService } from '../src/modules/attendance-request/attendance-request.service';
import { AttendanceModel } from '../src/modules/attendance/attendance.model';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongod: MongoMemoryReplSet | null = null;

describe('Geolocation Attendance Verification', () => {
  let owner: any;
  let employeeUser: any;
  let workplace: any;
  let member: any;
  const attendanceService = new AttendanceRequestService();

  // Office location: Noida Sector 62 (28.6280, 77.3649) with 150m radius
  const officeLat = 28.6280;
  const officeLng = 77.3649;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(mongod.getUri());

    owner = await UserModel.create({
      email: 'geo_owner@test.com',
      name: 'Geo Owner',
      accountType: 'ADMIN',
    });

    employeeUser = await UserModel.create({
      email: 'geo_emp@test.com',
      name: 'Geo Employee',
      accountType: 'EMPLOYEE',
    });

    workplace = await WorkplaceModel.create({
      name: 'Geo Test Workplace',
      ownerId: owner._id,
      timezone: 'Asia/Kolkata',
      attendanceSettings: {
        requireWifi: false,
        requireGeofence: true,
        latitude: officeLat,
        longitude: officeLng,
        geofenceRadius: 150,
      },
    });

    member = await WorkplaceMemberModel.create({
      workplaceId: workplace._id,
      userId: employeeUser._id,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      name: 'Geo Employee',
      employeeCode: 'EMP-GEO-01',
    });
  });

  after(async () => {
    await disconnectDatabase();
    if (mongod) await mongod.stop();
  });

  test('Auto-approves attendance when employee GPS is inside workplace geofence (no QR needed)', async () => {
    // 20 meters away from office
    const result = await attendanceService.submitRequest(employeeUser._id.toString(), {
      workplaceId: workplace._id.toString(),
      source: 'GEOFENCE',
      latitude: 28.6281,
      longitude: 77.3650,
      requestType: 'CHECK_IN',
    });

    assert.equal(result.autoApproved, true);
    assert.equal(result.geofenceVerified, true);
    assert.equal(result.request.status, 'APPROVED');

    // Verify record in AttendanceModel
    const record = await AttendanceModel.findOne({
      workplaceId: workplace._id,
      employeeMemberId: member._id,
    });

    assert.ok(record);
    assert.equal(record.status, 'PRESENT');
    assert.equal(record.source, 'GEOFENCE');
    assert.equal(record.verification.geofence, true);
  });

  test('Rejects attendance when employee is outside geofence', async () => {
    // 5 km away
    await assert.rejects(
      async () => {
        await attendanceService.submitRequest(employeeUser._id.toString(), {
          workplaceId: workplace._id.toString(),
          source: 'GEOFENCE',
          latitude: 28.7000,
          longitude: 77.4000,
          requestType: 'CHECK_OUT',
        });
      },
      (err: any) => {
        assert.equal(err.errorCode, 'OUTSIDE_GEOFENCE');
        return true;
      }
    );
  });

  test('Rejects attendance when location is missing and geofence is required', async () => {
    await assert.rejects(
      async () => {
        await attendanceService.submitRequest(employeeUser._id.toString(), {
          workplaceId: workplace._id.toString(),
          source: 'DIRECT',
          requestType: 'CHECK_OUT',
        });
      },
      (err: any) => {
        assert.equal(err.errorCode, 'LOCATION_REQUIRED');
        return true;
      }
    );
  });
});
