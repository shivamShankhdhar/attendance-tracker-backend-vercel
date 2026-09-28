import { Types } from 'mongoose';
import { AttendanceModel, IAttendance, AttendanceStatus } from './attendance.model';
import { AttendanceRequestModel } from '../attendance-request/attendance-request.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { AuditLogModel } from '../audit/audit.model';
import { getWorkplaceLocalDate } from '../../utils/date';
import { AppError } from '../../middleware/errorHandler';

export class AttendanceService {
  /**
   * Get today's roster showing all active employees and their attendance state
   */
  async getTodayRoster(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone);

    // 1. Fetch all active employees
    const employees = await WorkplaceMemberModel.find({
      workplaceId: new Types.ObjectId(workplaceId),
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    }).sort({ name: 1 });

    // 2. Fetch all attendance records for today
    const attendances = await AttendanceModel.find({
      workplaceId: new Types.ObjectId(workplaceId),
      attendanceDate: todayDate,
    });
    const attendanceMap = new Map(attendances.map((a) => [a.employeeMemberId.toString(), a]));

    // 3. Fetch all pending requests for today
    const requests = await AttendanceRequestModel.find({
      workplaceId: new Types.ObjectId(workplaceId),
      attendanceDate: todayDate,
      status: 'PENDING',
    });
    const pendingMap = new Map(requests.map((r) => [r.employeeMemberId.toString(), r]));

    let presentCount = 0;
    let pendingCount = 0;
    let notMarkedCount = 0;

    const roster = employees.map((emp) => {
      const empId = emp._id.toString();
      const attendance = attendanceMap.get(empId);
      const pendingReq = pendingMap.get(empId);

      let status: 'PRESENT' | 'PENDING' | 'NOT_MARKED' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' = 'NOT_MARKED';
      let checkInTime: Date | undefined;
      let approvedAt: Date | undefined;

      if (attendance) {
        status = attendance.status;
        checkInTime = attendance.checkInTime;
        approvedAt = attendance.approvedAt;
        if (attendance.status === 'PRESENT') presentCount++;
      } else if (pendingReq) {
        status = 'PENDING';
        checkInTime = pendingReq.requestedAt;
        pendingCount++;
      } else {
        notMarkedCount++;
      }

      return {
        memberId: empId,
        name: emp.name,
        employeeCode: emp.employeeCode,
        status,
        checkInTime,
        approvedAt,
        requestId: pendingReq?._id?.toString(),
        source: attendance?.source,
      };
    });

    return {
      attendanceDate: todayDate,
      counts: {
        totalEmployees: employees.length,
        presentCount,
        pendingCount,
        notMarkedCount,
      },
      roster,
    };
  }

  /**
   * Get employee's own attendance history
   */
  async getMyHistory(workplaceId: string, userId: string, query: { month?: string; startDate?: string; endDate?: string }) {
    const member = await WorkplaceMemberModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) {
      throw new AppError('Workplace membership not found', 404, 'MEMBERSHIP_NOT_FOUND');
    }

    const filter: any = {
      workplaceId: new Types.ObjectId(workplaceId),
      employeeMemberId: member._id,
    };

    if (query.month) {
      // YYYY-MM
      filter.attendanceDate = { $regex: `^${query.month}` };
    } else if (query.startDate && query.endDate) {
      filter.attendanceDate = { $gte: query.startDate, $lte: query.endDate };
    }

    const records = await AttendanceModel.find(filter).sort({ attendanceDate: -1 });

    return records.map((rec) => ({
      id: rec._id.toString(),
      attendanceDate: rec.attendanceDate,
      status: rec.status,
      checkInTime: rec.checkInTime,
      approvedAt: rec.approvedAt,
      source: rec.source,
      verification: rec.verification,
      correctionReason: rec.correctionReason,
    }));
  }

  /**
   * Employer reports: summary and date range breakdown
   */
  async getReports(workplaceId: string, query: { month?: string; startDate?: string; endDate?: string }) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const filter: any = { workplaceId: new Types.ObjectId(workplaceId) };

    if (query.month) {
      filter.attendanceDate = { $regex: `^${query.month}` };
    } else if (query.startDate && query.endDate) {
      filter.attendanceDate = { $gte: query.startDate, $lte: query.endDate };
    } else {
      // Default to current month
      const currentMonth = getWorkplaceLocalDate(new Date(), workplace.timezone).slice(0, 7);
      filter.attendanceDate = { $regex: `^${currentMonth}` };
    }

    const records = await AttendanceModel.find(filter)
      .populate('employeeMemberId', 'name employeeCode')
      .sort({ attendanceDate: -1 });

    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let leave = 0;

    for (const rec of records) {
      if (rec.status === 'PRESENT') present++;
      else if (rec.status === 'ABSENT') absent++;
      else if (rec.status === 'HALF_DAY') halfDay++;
      else if (rec.status === 'LEAVE') leave++;
    }

    const totalDays = records.length;
    const attendancePercentage = totalDays > 0 ? Math.round(((present + halfDay * 0.5) / totalDays) * 100) : 0;

    return {
      summary: {
        totalRecords: totalDays,
        present,
        absent,
        halfDay,
        leave,
        attendancePercentage,
      },
      records: records.map((rec: any) => ({
        id: rec._id.toString(),
        attendanceDate: rec.attendanceDate,
        status: rec.status,
        checkInTime: rec.checkInTime,
        approvedAt: rec.approvedAt,
        source: rec.source,
        employee: {
          memberId: rec.employeeMemberId?._id?.toString(),
          name: rec.employeeMemberId?.name,
          code: rec.employeeMemberId?.employeeCode,
        },
        correctionReason: rec.correctionReason,
      })),
    };
  }

  /**
   * Manual attendance marking or correction (EMPLOYER only)
   */
  async markManualAttendance(
    workplaceId: string,
    actorId: string,
    data: {
      employeeMemberId: string;
      attendanceDate: string;
      status: AttendanceStatus;
      correctionReason: string;
    }
  ) {
    const member = await WorkplaceMemberModel.findOne({
      _id: new Types.ObjectId(data.employeeMemberId),
      workplaceId: new Types.ObjectId(workplaceId),
    });

    if (!member) {
      throw new AppError('Employee not found in this workplace', 404, 'EMPLOYEE_NOT_FOUND');
    }

    const now = new Date();

    const attendance = await AttendanceModel.findOneAndUpdate(
      {
        workplaceId: new Types.ObjectId(workplaceId),
        employeeMemberId: member._id,
        attendanceDate: data.attendanceDate,
      },
      {
        $set: {
          status: data.status,
          source: 'MANUAL',
          approvedBy: new Types.ObjectId(actorId),
          approvedAt: now,
          correctionReason: data.correctionReason.trim(),
        },
        $setOnInsert: {
          workplaceId: new Types.ObjectId(workplaceId),
          employeeMemberId: member._id,
          userId: member.userId,
          attendanceDate: data.attendanceDate,
          checkInTime: now,
          verification: { qr: false, wifi: null },
        },
      },
      { upsert: true, new: true }
    );

    // Audit log
    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'ATTENDANCE_MODIFIED',
      entityId: attendance._id.toString(),
      metadata: {
        employeeName: member.name,
        attendanceDate: data.attendanceDate,
        status: data.status,
        reason: data.correctionReason,
      },
    });

    return {
      message: 'Manual attendance saved successfully',
      attendance,
    };
  }
}

export const attendanceService = new AttendanceService();
