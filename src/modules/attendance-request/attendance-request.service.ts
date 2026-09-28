import { Types } from 'mongoose';
import { AttendanceRequestModel, IAttendanceRequest } from './attendance-request.model';
import { AttendanceSessionModel } from '../attendance-session/attendance-session.model';
import { AttendanceModel } from '../attendance/attendance.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { AuditLogModel } from '../audit/audit.model';
import { NotificationOutboxModel } from '../notification/notification.model';
import { hashToken, generateSecureToken } from '../../utils/crypto';
import { getWorkplaceLocalDate } from '../../utils/date';
import { AppError } from '../../middleware/errorHandler';

export class AttendanceRequestService {
  /**
   * Employee scans QR and submits attendance request
   */
  async submitRequest(userId: string, data: { qrToken: string; deviceSsid?: string }) {
    const tokenHash = hashToken(data.qrToken.trim());

    // 1. Locate and validate AttendanceSession
    const session = await AttendanceSessionModel.findOne({
      qrTokenHash: tokenHash,
    });

    if (!session) {
      throw new AppError('Invalid or unrecognized QR code. Please scan today’s workplace QR.', 400, 'INVALID_QR_TOKEN');
    }

    if (session.status !== 'OPEN' || session.expiresAt <= new Date()) {
      throw new AppError('Today’s attendance session is closed or expired.', 400, 'SESSION_CLOSED_OR_EXPIRED');
    }

    // 2. Validate Workplace
    const workplace = await WorkplaceModel.findById(session.workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_INACTIVE');
    }

    // 3. Rule 7: Validate Employee belongs to this workplace
    const member = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
      role: 'EMPLOYEE',
    });

    if (!member) {
      throw new AppError('You are not an active employee of this workplace.', 403, 'NOT_WORKPLACE_EMPLOYEE');
    }

    const todayDate = session.attendanceDate;

    // 4. Rule 2: Check if Attendance record already exists for today
    const existingAttendance = await AttendanceModel.findOne({
      workplaceId: workplace._id,
      employeeMemberId: member._id,
      attendanceDate: todayDate,
    });

    if (existingAttendance) {
      return {
        isAlreadyPresent: true,
        attendance: {
          id: existingAttendance._id.toString(),
          status: existingAttendance.status,
          checkInTime: existingAttendance.checkInTime,
          approvedAt: existingAttendance.approvedAt,
        },
        message: 'You are already marked present for today!',
      };
    }

    // 5. Check if AttendanceRequest already exists for today
    let request = await AttendanceRequestModel.findOne({
      workplaceId: workplace._id,
      employeeMemberId: member._id,
      attendanceDate: todayDate,
    });

    if (request) {
      return {
        request: {
          id: request._id.toString(),
          workplaceId: request.workplaceId.toString(),
          workplaceName: workplace.name,
          status: request.status,
          requestedAt: request.requestedAt,
          verification: request.verification,
          rejectionReason: request.rejectionReason,
        },
        message:
          request.status === 'APPROVED'
            ? 'Attendance already approved!'
            : request.status === 'PENDING'
            ? 'Your attendance request is already pending approval from your employer.'
            : 'Your request was previously reviewed.',
      };
    }

    // 6. Section 11: Wi-Fi verification signal
    let wifiVerified: boolean | null = null;
    if (workplace.wifiSsid && data.deviceSsid) {
      wifiVerified = workplace.wifiSsid.trim().toLowerCase() === data.deviceSsid.trim().toLowerCase();
    }

    const requestedAt = new Date();

    request = await AttendanceRequestModel.create({
      workplaceId: workplace._id,
      attendanceSessionId: session._id,
      employeeMemberId: member._id,
      userId: new Types.ObjectId(userId),
      attendanceDate: todayDate,
      requestedAt,
      verification: {
        qrVerified: true,
        wifiVerified,
        deviceSsid: data.deviceSsid,
      },
      status: 'PENDING',
    });

    // 7. Persist notification job for employer
    await NotificationOutboxModel.create({
      eventId: `req_${request._id.toString()}_${Date.now()}`,
      recipientId: workplace.ownerId,
      workplaceId: workplace._id,
      kind: 'ATTENDANCE_REQUESTED',
      title: 'New Attendance Request',
      body: `${member.name} requested attendance for ${todayDate}`,
      data: {
        requestId: request._id.toString(),
        employeeName: member.name,
        employeeCode: member.employeeCode,
        requestedAt: requestedAt.toISOString(),
      },
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
    });

    return {
      request: {
        id: request._id.toString(),
        workplaceId: workplace._id.toString(),
        workplaceName: workplace.name,
        status: request.status,
        requestedAt: request.requestedAt,
        verification: request.verification,
      },
      message: 'Attendance requested! Waiting for your employer to approve.',
    };
  }

  /**
   * Employer lists attendance requests for workplace
   */
  async getWorkplaceRequests(workplaceId: string, status?: string, date?: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const filter: any = { workplaceId: new Types.ObjectId(workplaceId) };
    if (status) filter.status = status;
    if (date) {
      filter.attendanceDate = date;
    } else {
      // Default to today
      filter.attendanceDate = getWorkplaceLocalDate(new Date(), workplace.timezone);
    }

    const requests = await AttendanceRequestModel.find(filter)
      .sort({ requestedAt: -1 })
      .populate('employeeMemberId', 'name employeeCode invitedEmail');

    return requests.map((req: any) => ({
      id: req._id.toString(),
      attendanceDate: req.attendanceDate,
      requestedAt: req.requestedAt,
      status: req.status,
      employee: {
        memberId: req.employeeMemberId?._id?.toString(),
        name: req.employeeMemberId?.name || 'Employee',
        code: req.employeeMemberId?.employeeCode,
        email: req.employeeMemberId?.invitedEmail,
      },
      verification: req.verification,
      rejectionReason: req.rejectionReason,
      reviewedAt: req.reviewedAt,
    }));
  }

  /**
   * Employee gets their own request for today
   */
  async getMyTodayRequest(workplaceId: string, userId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone);

    const member = await WorkplaceMemberModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) return null;

    const request = await AttendanceRequestModel.findOne({
      workplaceId: workplace._id,
      employeeMemberId: member._id,
      attendanceDate: todayDate,
    });

    if (!request) return null;

    return {
      id: request._id.toString(),
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      verification: request.verification,
      rejectionReason: request.rejectionReason,
    };
  }

  /**
   * Employer approves an attendance request
   */
  async approveRequest(workplaceId: string, requestId: string, employerUserId: string) {
    const request = await AttendanceRequestModel.findOne({
      _id: new Types.ObjectId(requestId),
      workplaceId: new Types.ObjectId(workplaceId),
    }).populate('employeeMemberId', 'name employeeCode');

    if (!request) {
      throw new AppError('Attendance request not found', 404, 'REQUEST_NOT_FOUND');
    }

    // Rule 9: Idempotency - if already approved, return existing attendance
    if (request.status === 'APPROVED') {
      const existingAttendance = await AttendanceModel.findOne({
        workplaceId: request.workplaceId,
        attendanceRequestId: request._id,
      });
      return {
        message: 'Request already approved',
        attendance: existingAttendance,
      };
    }

    if (request.status === 'REJECTED') {
      throw new AppError('Request was already rejected and cannot be approved', 400, 'REQUEST_ALREADY_REJECTED');
    }

    const now = new Date();

    // 1. Create or upsert Attendance record
    // Section 13: checkInTime = requestedAt, approvedAt = now
    const attendance = await AttendanceModel.findOneAndUpdate(
      {
        workplaceId: request.workplaceId,
        employeeMemberId: request.employeeMemberId._id,
        attendanceDate: request.attendanceDate,
      },
      {
        $setOnInsert: {
          workplaceId: request.workplaceId,
          employeeMemberId: request.employeeMemberId._id,
          userId: request.userId,
          attendanceDate: request.attendanceDate,
          status: 'PRESENT',
          checkInTime: request.requestedAt,
          approvedAt: now,
          approvedBy: new Types.ObjectId(employerUserId),
          source: 'QR_REQUEST',
          attendanceRequestId: request._id,
          verification: {
            qr: request.verification.qrVerified,
            wifi: request.verification.wifiVerified,
          },
        },
      },
      { upsert: true, new: true }
    );

    // 2. Mark request APPROVED
    request.status = 'APPROVED';
    request.reviewedBy = new Types.ObjectId(employerUserId);
    request.reviewedAt = now;
    await request.save();

    // 3. Log audit event
    await AuditLogModel.create({
      workplaceId: request.workplaceId,
      actorId: new Types.ObjectId(employerUserId),
      action: 'ATTENDANCE_APPROVED',
      entityId: attendance._id.toString(),
      metadata: {
        requestId: request._id.toString(),
        attendanceDate: request.attendanceDate,
      },
    });

    // 4. Create notification job for employee
    await NotificationOutboxModel.create({
      eventId: `appr_${request._id.toString()}_${Date.now()}`,
      recipientId: request.userId,
      workplaceId: request.workplaceId,
      kind: 'ATTENDANCE_APPROVED',
      title: 'Attendance Approved!',
      body: `Your attendance for ${request.attendanceDate} has been approved.`,
      data: {
        attendanceId: attendance._id.toString(),
        attendanceDate: request.attendanceDate,
      },
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
    });

    return {
      message: 'Attendance approved successfully',
      attendance,
    };
  }

  /**
   * Employer rejects an attendance request
   */
  async rejectRequest(workplaceId: string, requestId: string, employerUserId: string, reason?: string) {
    const request = await AttendanceRequestModel.findOne({
      _id: new Types.ObjectId(requestId),
      workplaceId: new Types.ObjectId(workplaceId),
    });

    if (!request) {
      throw new AppError('Attendance request not found', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status === 'APPROVED') {
      throw new AppError('Request was already approved and cannot be rejected', 400, 'REQUEST_ALREADY_APPROVED');
    }

    const now = new Date();
    request.status = 'REJECTED';
    request.reviewedBy = new Types.ObjectId(employerUserId);
    request.reviewedAt = now;
    request.rejectionReason = reason?.trim();
    await request.save();

    // Log audit event
    await AuditLogModel.create({
      workplaceId: request.workplaceId,
      actorId: new Types.ObjectId(employerUserId),
      action: 'ATTENDANCE_REJECTED',
      entityId: request._id.toString(),
      metadata: { reason, attendanceDate: request.attendanceDate },
    });

    // Create notification job for employee
    await NotificationOutboxModel.create({
      eventId: `rej_${request._id.toString()}_${Date.now()}`,
      recipientId: request.userId,
      workplaceId: request.workplaceId,
      kind: 'ATTENDANCE_REJECTED',
      title: 'Attendance Request Declined',
      body: reason ? `Declined: ${reason}` : `Your attendance request for ${request.attendanceDate} was declined.`,
      data: {
        requestId: request._id.toString(),
        reason,
      },
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
    });

    return {
      message: 'Attendance request rejected',
      requestId: request._id.toString(),
      status: request.status,
    };
  }
}

export const attendanceRequestService = new AttendanceRequestService();
