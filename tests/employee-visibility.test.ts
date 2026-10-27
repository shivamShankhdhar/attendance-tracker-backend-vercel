import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EmployeeService } from '../src/modules/employee/employee.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { WorkplaceMemberModel } from '../src/modules/employee/workplace-member.model';
import { WorkplaceModel } from '../src/modules/workplace/workplace.model';
import { AttendanceModel } from '../src/modules/attendance/attendance.model';
import { AttendanceRequestModel } from '../src/modules/attendance-request/attendance-request.model';

const id = '111111111111111111111111';
const employee = { _id: id, name: 'Employee', employeeCode: 'EMP-1', role: 'EMPLOYEE', status: 'ACTIVE' };
function query(rows: any[]) {
  const chain: any = { populate: () => chain, select: () => chain, sort: () => chain,
    lean: async () => rows, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
  return chain;
}
test('employee directory includes role and excludes employers at the query boundary', async () => {
  mock.method(WorkplaceMemberModel, 'find', (filter: any) => {
    assert.equal(filter.role, 'EMPLOYEE');
    assert.equal(filter.workplaceId.toString(), id);
    return query([employee]);
  });
  try {
    const rows = await new EmployeeService().getEmployees(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'EMPLOYEE');
    assert.equal(rows[0].id, id);
  } finally { mock.restoreAll(); }
});
test('employer roster includes employee punch and role without counting employers', async () => {
  mock.method(WorkplaceModel, 'findById', async () => ({ _id: id, timezone: 'Asia/Kolkata' }));
  mock.method(WorkplaceMemberModel, 'find', (filter: any) => {
    assert.equal(filter.role, 'EMPLOYEE');
    return query([employee]);
  });
  const checkInTime = new Date('2026-10-27T04:00:00Z');
  mock.method(AttendanceModel, 'find', () => query([{ employeeMemberId: id, status: 'PRESENT', checkInTime }]));
  mock.method(AttendanceRequestModel, 'find', () => query([]));
  try {
    const result = await new AttendanceService().getTodayRoster(id, '2026-10-27');
    assert.equal(result.counts.totalEmployees, 1);
    assert.equal(result.counts.presentCount, 1);
    assert.equal(result.roster[0].role, 'EMPLOYEE');
    assert.equal(result.roster[0].memberId, id);
    assert.equal(result.roster[0].checkInTime, checkInTime);
  } finally { mock.restoreAll(); }
});
