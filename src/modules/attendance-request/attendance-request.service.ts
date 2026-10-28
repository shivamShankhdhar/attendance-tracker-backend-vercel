import { prisma } from '../../config/database';
import { localRequestInstant } from './request-time';
import { Types } from '../../config/prisma-compat';
import { AttendanceRequestModel, IAttendanceRequest } from './attendance-request.model';
import { AttendanceSessionModel } from '../attendance-session/attendance-session.model';
import { AttendanceModel } from '../attendance/attendance.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { AuditLogModel } from '../audit/audit.model';
import { NotificationOutboxModel } from '../notification/notification.model';
import { hashToken, generateSecureToken, encryptToken } from '../../utils/crypto';
import { getWorkplaceLocalDate } from '../../utils/date';
import { AppError } from '../../middleware/errorHandler';

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export class AttendanceRequestService {
  constructor(private readonly db: typeof prisma = prisma) {}

  async submitManualRequest(userId: string, data: { workplaceId?: string; requestType?: string; attendanceDate?: string; proposedTime?: string; note?: string }) {
    const workplace = await this.db.workplace.findUnique({ where: { id: data.workplaceId || '' } });
    if (!workplace || workplace.status !== 'ACTIVE') throw new AppError('Workplace unavailable', 404, 'WORKPLACE_NOT_FOUND');
    const member = await this.db.workplaceMember.findFirst({ where: { workplaceId: workplace.id, userId, status: 'ACTIVE', role: 'EMPLOYEE' } });
    if (!member) throw new AppError('An active employee membership is required', 403, 'NOT_WORKPLACE_EMPLOYEE');
    const date = data.attendanceDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !data.note?.trim()) {
      throw new AppError('Choose a valid date and enter a reason', 400, 'INVALID_REQUEST');
    }
    const correction = data.requestType === 'MISSED_PUNCH' || data.requestType === 'MISSED_CHECK_OUT';
    if (correction) {
      const instant = localRequestInstant(date, data.proposedTime || '', workplace.timezone);
      if (instant > new Date()) throw new AppError('A missed punch cannot be in the future', 400, 'FUTURE_CORRECTION');
    }
    const requestType = data.requestType!;
    const key = { workplaceId: workplace.id, employeeMemberId: member.id, attendanceDate: date, requestType };
    const existing = await this.db.attendanceRequest.findUnique({ where: { workplaceId_employeeMemberId_attendanceDate_requestType: key } });
    if (existing) throw new AppError('A request for this type and date already exists. Check its status below.', 409, 'DUPLICATE_REQUEST');
    const session = await this.db.attendanceSession.upsert({
      where: { workplaceId_attendanceDate: { workplaceId: workplace.id, attendanceDate: date } }, update: {},
      create: { workplaceId: workplace.id, attendanceDate: date, createdById: workplace.ownerId,
        qrTokenHash: hashToken(generateSecureToken(32)), encryptedQrToken: encryptToken(generateSecureToken(32)), status: 'CLOSED', openedAt: new Date(), expiresAt: new Date() },
    });
    const request = await this.db.attendanceRequest.create({ data: {
      ...key, userId, attendanceSessionId: session.id, requestedAt: new Date(), status: 'PENDING',
      note: data.note.trim(), proposedTime: correction ? data.proposedTime : null,
    } });
    return { request, message: 'Request submitted' };
  }

  async getMyRequests(workplaceId: string, userId: string) {
    const member = await this.db.workplaceMember.findFirst({ where: { workplaceId, userId, status: 'ACTIVE' } });
    if (!member) throw new AppError('Active membership required', 403, 'NOT_WORKPLACE_EMPLOYEE');
    const rows = await this.db.attendanceRequest.findMany({ where: { workplaceId, employeeMemberId: member.id }, orderBy: { requestedAt: 'desc' }, take: 200 });
    return rows.filter(r => !r.qrVerified && !r.geofenceVerified).map(r => ({ ...r, employee: { memberId: member.id, name: member.name, code: member.employeeCode } }));
  }

  async approveManualRequest(workplaceId: string, requestId: string, employerUserId: string) {
    return this.db.$transaction(async tx => {
      const req = await tx.attendanceRequest.findUnique({ where: { id: requestId } });
      if (!req || req.workplaceId !== workplaceId) throw new AppError('Request not found', 404, 'REQUEST_NOT_FOUND');
      if (req.status !== 'PENDING') throw new AppError('Request has already been reviewed', 409, 'REQUEST_REVIEWED');
      const workplace = await tx.workplace.findUniqueOrThrow({ where: { id: workplaceId } });
      const key = { workplaceId, employeeMemberId: req.employeeMemberId, attendanceDate: req.attendanceDate };
      const existing = await tx.attendance.findUnique({ where: { workplaceId_employeeMemberId_attendanceDate: key } });
      const leave = req.requestType.endsWith('_LEAVE');
      let patch: any;
      if (leave) {
        if (existing?.checkInTime || existing?.checkOutTime) throw new AppError('This date already has attendance. Review it before approving leave.', 409, 'ATTENDANCE_CONFLICT');
        patch = { status: 'LEAVE', checkInTime: null, checkOutTime: null };
      } else {
        const instant = localRequestInstant(req.attendanceDate, req.proposedTime || '', workplace.timezone);
        if (req.requestType === 'MISSED_CHECK_OUT') {
          if (!existing?.checkInTime || instant < existing.checkInTime) throw new AppError('Check-out must follow a recorded check-in', 400, 'INVALID_CHECK_OUT');
          if (existing.checkOutTime) throw new AppError('A check-out is already recorded for this date', 409, 'ATTENDANCE_CONFLICT');
          patch = { status: 'PRESENT', checkOutTime: instant };
        } else {
          if (existing?.checkInTime) throw new AppError('A check-in is already recorded for this date', 409, 'ATTENDANCE_CONFLICT');
          if (existing?.checkOutTime && instant > existing.checkOutTime) throw new AppError('Check-in must precede check-out', 400, 'INVALID_CHECK_IN');
          patch = { status: 'PRESENT', checkInTime: instant };
        }
      }
      const updated = await tx.attendanceRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: employerUserId } });
      if (updated.count !== 1) throw new AppError('Request was already reviewed', 409, 'REQUEST_REVIEWED');
      const details = { ...patch, approvedAt: new Date(), approvedById: employerUserId, source: 'MANUAL', correctionReason: req.note, attendanceRequestId: req.id };
      const attendance = await tx.attendance.upsert({ where: { workplaceId_employeeMemberId_attendanceDate: key },
        create: { ...key, userId: req.userId, ...details }, update: details });
      // Delete completed request after attendance is recorded to prevent database clutter
      if (typeof tx.attendanceRequest?.deleteMany === 'function') {
        await tx.attendanceRequest.deleteMany({ where: { id: requestId } });
      }
      return { attendance, message: 'Request approved' };
    });
  }

  /**
   * Employee submits attendance request from QR scan, geolocation, or direct request
   */
  async submitRequest(userId: string, data: { qrToken?: string; workplaceId?: string; deviceSsid?: string; source?: 'QR' | 'DIRECT' | 'MANUAL' | 'GEOFENCE'; note?: string; requestType?: string; attendanceDate?: string; proposedTime?: string; latitude?: number; longitude?: number; accuracy?: number }) {
    if (['MISSED_PUNCH', 'MISSED_CHECK_OUT', 'CASUAL_LEAVE', 'SICK_LEAVE', 'PAID_LEAVE'].includes(data.requestType || '')) {
      return this.submitManualRequest(userId, data);
    }
    if (data.source === 'MANUAL') throw new AppError('Choose a correction or leave request type.', 400, 'INVALID_MANUAL_REQUEST');
    let session: any = null;
    let workplace: any = null;
    let todayDate: string = '';
    const requestType = data.requestType || 'CHECK_IN';

    if (data.qrToken) {
      const tokenHash = hashToken(data.qrToken.trim());

      // 1. Locate and validate AttendanceSession
      session = await AttendanceSessionModel.findOne({
        qrTokenHash: tokenHash,
      });

      if (!session) {
        throw new AppError('Invalid or unrecognized QR code. Please scan today’s workplace QR.', 400, 'INVALID_QR_TOKEN');
      }

      if (session.status !== 'OPEN' || session.expiresAt <= new Date()) {
        throw new AppError('Today’s attendance session is closed or expired.', 400, 'SESSION_CLOSED_OR_EXPIRED');
      }

      // 2. Validate Workplace
      workplace = await WorkplaceModel.findById(session.workplaceId);
      if (!workplace || workplace.status !== 'ACTIVE') {
        throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_INACTIVE');
      }

      todayDate = session.attendanceDate;
    } else if (data.workplaceId) {
      const cleanWp = data.workplaceId.trim();
      workplace = await WorkplaceModel.findById(cleanWp);
      if (!workplace) {
        workplace = await WorkplaceModel.findOne({
          $or: [
            { workplaceCode: cleanWp.toUpperCase() },
            { workplaceCode: cleanWp.replace(/^wp_/i, '').toUpperCase() },
            { code: cleanWp.toUpperCase() },
            { code: cleanWp.replace(/^wp_/i, '').toUpperCase() },
          ],
          status: 'ACTIVE',
        });
      }
      if (!workplace || workplace.status !== 'ACTIVE') {
        throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_INACTIVE');
      }

      todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone || 'Asia/Kolkata');

      session = await AttendanceSessionModel.findOne({
        workplaceId: workplace._id,
        attendanceDate: todayDate,
      });

      if (!session) {
        const rawQr = generateSecureToken(32);
        session = await AttendanceSessionModel.create({
          workplaceId: workplace._id,
          createdBy: workplace.ownerId,
          attendanceDate: todayDate,
          qrTokenHash: hashToken(rawQr),
          encryptedQrToken: encryptToken(rawQr),
          status: 'OPEN',
          openedAt: new Date(),
          expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000),
        });
      }
    } else {
      throw new AppError('Either QR token or workplace ID is required.', 400, 'BAD_REQUEST');
    }

    // Validate Employee / Member belongs to this workplace
    const member = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    });

    if (!member) {
      throw new AppError('You are not an active employee of this workplace.', 403, 'NOT_WORKPLACE_EMPLOYEE');
    }

    // 4. Check existing attendance record for today
    const existingAttendance = await AttendanceModel.findOne({
      workplaceId: workplace._id,
      employeeMemberId: member._id,
      attendanceDate: todayDate,
    });

    if (requestType === 'CHECK_OUT') {
      if (!existingAttendance) {
        throw new AppError('Cannot check out: you have not checked in for today yet.', 400, 'NO_CHECK_IN_FOUND');
      }
      if (existingAttendance.checkOutTime) {
        return {
          isAlreadyCheckedOut: true,
          attendance: {
            id: existingAttendance._id.toString(),
            status: existingAttendance.status,
            checkInTime: existingAttendance.checkInTime,
            checkOutTime: existingAttendance.checkOutTime,
            approvedAt: existingAttendance.approvedAt,
          },
          message: 'You have already checked out for today!',
        };
      }

      // Check if a CHECK_OUT request already exists
      const existingReq = await AttendanceRequestModel.findOne({
        workplaceId: workplace._id,
        employeeMemberId: member._id,
        attendanceDate: todayDate,
        requestType: 'CHECK_OUT',
      });

      if (existingReq && !data.qrToken && data.source !== 'GEOFENCE' && data.source !== 'DIRECT') {
        return {
          request: {
            id: existingReq._id.toString(),
            workplaceId: existingReq.workplaceId.toString(),
            workplaceName: workplace.name,
            status: existingReq.status,
            requestedAt: existingReq.requestedAt,
            verification: existingReq.verification,
            rejectionReason: existingReq.rejectionReason,
            requestType: existingReq.requestType,
          },
          message:
            existingReq.status === 'APPROVED'
              ? 'Check-out already approved!'
              : 'Your check-out request is pending approval from your employer.',
        };
      }
    } else {
      // CHECK_IN request
      if (existingAttendance) {
        return {
          isAlreadyPresent: true,
          attendance: {
            id: existingAttendance._id.toString(),
            status: existingAttendance.status,
            checkInTime: existingAttendance.checkInTime,
            checkOutTime: existingAttendance.checkOutTime,
            approvedAt: existingAttendance.approvedAt,
          },
          message: 'You are already marked present for today!',
        };
      }

      // 5. Check if AttendanceRequest already exists for today
      const existingReq = await AttendanceRequestModel.findOne({
        workplaceId: workplace._id,
        employeeMemberId: member._id,
        attendanceDate: todayDate,
        requestType: 'CHECK_IN',
      });

      if (existingReq && !data.qrToken && data.source !== 'GEOFENCE' && data.source !== 'DIRECT') {
        return {
          request: {
            id: existingReq._id.toString(),
            workplaceId: existingReq.workplaceId.toString(),
            workplaceName: workplace.name,
            status: existingReq.status,
            requestedAt: existingReq.requestedAt,
            verification: existingReq.verification,
            rejectionReason: existingReq.rejectionReason,
            requestType: existingReq.requestType,
          },
          message:
            existingReq.status === 'APPROVED'
              ? 'Attendance already approved!'
              : existingReq.status === 'PENDING'
              ? 'Your attendance request is already pending approval from your employer.'
              : 'Your request was previously reviewed.',
        };
      }
    }

    // Direct and geofence punches verify location independently of office Wi-Fi.
    const isLocationPunch = data.source === 'DIRECT' || data.source === 'GEOFENCE';
    let wifiVerified: boolean | null = null;
    if (!isLocationPunch && workplace.wifiSsid && data.deviceSsid) {
      wifiVerified = workplace.wifiSsid.trim().toLowerCase() === data.deviceSsid.trim().toLowerCase();
    }

    // ── Geolocation Verification ──────────────────────────────────────────────
    const wpSettings = workplace.attendanceSettings || {};
    const wpLat: number | undefined = wpSettings.latitude ?? (workplace as any).latitude;
    const wpLng: number | undefined = wpSettings.longitude ?? (workplace as any).longitude;
    const wpRadius: number = wpSettings.geofenceRadius ?? (workplace as any).geofenceRadius ?? 100;
    const requireGeofence: boolean = Boolean(wpSettings.requireGeofence);

    let geofenceVerified: boolean | null = null;
    let distanceMeters: number | undefined = undefined;

    if (data.latitude != null && data.longitude != null && wpLat != null && wpLng != null) {
      const exactDistance = calculateDistanceMeters(data.latitude, data.longitude, wpLat, wpLng);
      distanceMeters = Math.round(exactDistance);
      geofenceVerified = exactDistance <= wpRadius;
    }

    // If geofence is strictly enforced by the workplace, validate employee coordinates:
    if (requireGeofence || isLocationPunch) {
      if (wpLat == null || wpLng == null || !Number.isFinite(wpLat) || !Number.isFinite(wpLng) || !Number.isFinite(wpRadius) || wpRadius <= 0) {
        throw new AppError('Ask your employer to configure the office location and radius.', 400, 'OFFICE_LOCATION_NOT_CONFIGURED');
      }
      if (data.latitude == null || data.longitude == null) {
        throw new AppError(
          'This workplace requires location verification to mark attendance. Please enable location permissions.',
          400,
          'LOCATION_REQUIRED'
        );
      }
      if (geofenceVerified !== true) {
        throw new AppError(
          `You are outside the workplace geofence (${distanceMeters ?? '?'}m away). You must be within ${wpRadius}m of the workplace.`,
          400,
          'OUTSIDE_GEOFENCE'
        );
      }
    }

    if (isLocationPunch) {
      const maxAllowedAccuracy = Math.max(wpRadius * 1.5, 150);
      if (data.accuracy == null || !Number.isFinite(data.accuracy) || data.accuracy <= 0 || data.accuracy > maxAllowedAccuracy) {
        throw new AppError('GPS accuracy is insufficient. Enable precise location or move to a clearer spot near the office and retry.', 400, 'LOCATION_INACCURATE');
      }
    }

    const requestedAt = new Date();
    const qrVerified = Boolean(data.qrToken);
    // Auto-approve if QR was scanned OR if employee is verified at the workplace geofence / direct office location! No employer approval needed!
    const isAutoApproved = qrVerified || geofenceVerified === true;
    if (!isLocationPunch && wpSettings.requireWifi && wifiVerified !== true) {
      throw new AppError('Connect to the workplace Wi-Fi before punching.', 400, 'WIFI_REQUIRED');
    }

    // ── AUTO-APPROVE (QR Scan OR Geolocation match → No employer action needed) ───
    if (isAutoApproved) {
      const source = geofenceVerified ? 'GEOFENCE' : 'QR_SCAN';
      // Reuse a previous pending request after fresh location verification.
      const key = { workplaceId: workplace.id, employeeMemberId: member.id, attendanceDate: todayDate, requestType };
      let savedRequest: any;
      try {
        savedRequest = await this.db.attendanceRequest.upsert({
          where: { workplaceId_employeeMemberId_attendanceDate_requestType: key },
          create: { ...key, attendanceSessionId: session.id, userId, requestedAt,
            qrVerified, wifiVerified, geofenceVerified, distanceMeters, status: 'APPROVED', reviewedAt: requestedAt },
          update: { status: 'APPROVED', requestedAt, reviewedAt: requestedAt, qrVerified, wifiVerified, geofenceVerified, distanceMeters },
        });
      } catch (upsertError: any) {
        console.warn('[AttendanceRequest] Upsert failed, falling back to findFirst/create/update:', upsertError?.message);
        const existing = await this.db.attendanceRequest.findFirst({ where: key });
        if (existing) {
          savedRequest = await this.db.attendanceRequest.update({
            where: { id: existing.id },
            data: { status: 'APPROVED', requestedAt, reviewedAt: requestedAt, qrVerified, wifiVerified, geofenceVerified, distanceMeters },
          });
        } else {
          savedRequest = await this.db.attendanceRequest.create({
            data: { ...key, attendanceSessionId: session.id, userId, requestedAt,
              qrVerified, wifiVerified, geofenceVerified, distanceMeters, status: 'APPROVED', reviewedAt: requestedAt },
          });
        }
      }
      const request = { ...savedRequest, _id: savedRequest?.id || 'auto-approved', verification: { qrVerified, wifiVerified, geofenceVerified, distanceMeters } };

      if (requestType === 'CHECK_OUT') {
        await AttendanceModel.findOneAndUpdate(
          { workplaceId: workplace._id, employeeMemberId: member._id, attendanceDate: todayDate },
          { $set: { checkOutTime: requestedAt } },
          { new: true }
        );
      } else {
        await AttendanceModel.findOneAndUpdate(
          { workplaceId: workplace._id, employeeMemberId: member._id, attendanceDate: todayDate },
          {
            $setOnInsert: {
              workplaceId: workplace._id,
              employeeMemberId: member._id,
              userId: new Types.ObjectId(userId),
              attendanceDate: todayDate,
              status: 'PRESENT',
              checkInTime: requestedAt,
              approvedAt: requestedAt,
              source,
              attendanceRequestId: request._id,
              verification: {
                qr: qrVerified,
                wifi: wifiVerified,
                geofence: geofenceVerified,
                distanceMeters,
              },
            },
          },
          { upsert: true, new: true }
        );
      }

      // Delete completed auto-approved request after recording attendance to prevent database accumulation
      if (typeof this.db.attendanceRequest?.deleteMany === 'function') {
        await this.db.attendanceRequest.deleteMany({
          where: { workplaceId: workplace.id, employeeMemberId: member.id, attendanceDate: todayDate }
        });
      }

      await NotificationOutboxModel.create({
        eventId: `auto_${request._id.toString()}_${Date.now()}`,
        recipientId: new Types.ObjectId(userId),
        workplaceId: workplace._id,
        kind: requestType === 'CHECK_OUT' ? 'CHECK_OUT_APPROVED' : 'ATTENDANCE_APPROVED',
        title: requestType === 'CHECK_OUT' ? 'Check-Out Confirmed!' : 'Attendance Confirmed!',
        body:
          requestType === 'CHECK_OUT'
            ? `Your check-out for ${todayDate} was recorded via ${geofenceVerified ? 'workplace geolocation' : 'QR scan'}.`
            : `Your attendance for ${todayDate} was recorded via ${geofenceVerified ? 'workplace geolocation' : 'QR scan'}.`,
        data: { requestId: request._id.toString(), requestType, attendanceDate: todayDate },
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      });

      const successMsg = requestType === 'CHECK_OUT'
        ? (geofenceVerified ? 'Check-out recorded! Geolocation verified at workplace.' : 'Check-out recorded! QR scan verified.')
        : (geofenceVerified ? 'Attendance recorded! Geolocation verified at workplace.' : 'Attendance recorded! QR scan verified.');

      return {
        request: {
          id: request._id.toString(),
          workplaceId: workplace._id.toString(),
          workplaceName: workplace.name,
          status: 'APPROVED',
          requestedAt: request.requestedAt,
          verification: request.verification,
          requestType: request.requestType,
          autoApproved: true,
          geofenceVerified: Boolean(geofenceVerified),
          distanceMeters,
        },
        attendance: await this.db.attendance.findUnique({ where: { workplaceId_employeeMemberId_attendanceDate: {
          workplaceId: workplace.id, employeeMemberId: member.id, attendanceDate: todayDate,
        } } }),
        autoApproved: true,
        geofenceVerified: Boolean(geofenceVerified),
        distanceMeters,
        message: successMsg,
      };
    }

    // ── DIRECT REQUEST → PENDING (needs employer approval) ─────────────────────
    const request = await AttendanceRequestModel.create({
      workplaceId: workplace._id,
      attendanceSessionId: session._id,
      employeeMemberId: member._id,
      userId: new Types.ObjectId(userId),
      attendanceDate: todayDate,
      requestedAt,
      requestType,
      verification: {
        qrVerified,
        wifiVerified,
        geofenceVerified,
        distanceMeters,
        deviceSsid: data.deviceSsid,
      },
      status: 'PENDING',
    });

    await NotificationOutboxModel.create({
      eventId: `req_${request._id.toString()}_${Date.now()}`,
      recipientId: workplace.ownerId,
      workplaceId: workplace._id,
      kind: requestType === 'CHECK_OUT' ? 'CHECK_OUT_REQUESTED' : 'ATTENDANCE_REQUESTED',
      title: requestType === 'CHECK_OUT' ? 'New Check-Out Request' : 'New Attendance Request',
      body: `${member.name} requested ${requestType === 'CHECK_OUT' ? 'check-out' : 'attendance'} for ${todayDate}`,
      data: {
        requestId: request._id.toString(),
        requestType,
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
        requestType: request.requestType,
        geofenceVerified: Boolean(geofenceVerified),
        distanceMeters,
      },
      geofenceVerified: Boolean(geofenceVerified),
      distanceMeters,
      message:
        requestType === 'CHECK_OUT'
          ? 'Check-out requested! Waiting for your employer to approve.'
          : 'Attendance requested! Waiting for your employer to approve.',
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
    }

    const requests = await AttendanceRequestModel.find(filter)
      .sort({ requestedAt: -1 })
      .populate({
        path: 'employeeMemberId',
        select: 'name employeeCode invitedEmail userId',
        populate: {
          path: 'userId',
          select: 'avatarUrl',
        },
      });

    return requests.filter(req => !req.verification.qrVerified && !req.verification.geofenceVerified).map((req: any) => ({
      id: req._id.toString(),
      attendanceDate: req.attendanceDate,
      requestedAt: req.requestedAt,
      status: req.status,
      requestType: req.requestType || 'CHECK_IN',
      note: req.note,
      proposedTime: req.proposedTime,
      employee: {
        memberId: req.employeeMemberId?._id?.toString(),
        name: req.employeeMemberId?.name || 'Employee',
        code: req.employeeMemberId?.employeeCode,
        email: req.employeeMemberId?.invitedEmail,
        avatarUrl: req.employeeMemberId?.userId?.avatarUrl || undefined,
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
    }).sort({ requestedAt: -1 });

    if (!request) return null;

    return {
      id: request._id.toString(),
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      status: request.status,
      requestType: request.requestType || 'CHECK_IN',
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

    if (['MISSED_PUNCH', 'MISSED_CHECK_OUT', 'CASUAL_LEAVE', 'SICK_LEAVE', 'PAID_LEAVE'].includes(request.requestType)) {
      return this.approveManualRequest(workplaceId, requestId, employerUserId);
    }
    const now = new Date();

    if (request.requestType === 'CHECK_OUT') {
      const attendance = await AttendanceModel.findOneAndUpdate(
        {
          workplaceId: request.workplaceId,
          employeeMemberId: request.employeeMemberId._id,
          attendanceDate: request.attendanceDate,
        },
        {
          $set: {
            checkOutTime: request.requestedAt || now,
          },
        },
        { new: true }
      );

      // Delete completed request after approval to keep database clean
      await AttendanceRequestModel.deleteOne({ _id: request._id });

      await AuditLogModel.create({
        workplaceId: request.workplaceId,
        actorId: new Types.ObjectId(employerUserId),
        action: 'ATTENDANCE_CHECKOUT_APPROVED',
        entityId: attendance ? attendance._id.toString() : request._id.toString(),
        metadata: {
          requestId: request._id.toString(),
          attendanceDate: request.attendanceDate,
        },
      });

      await NotificationOutboxModel.create({
        eventId: `appr_out_${request._id.toString()}_${Date.now()}`,
        recipientId: request.userId,
        workplaceId: request.workplaceId,
        kind: 'CHECK_OUT_APPROVED',
        title: 'Check-Out Approved!',
        body: `Your check-out for ${request.attendanceDate} has been approved.`,
        data: {
          attendanceId: attendance?._id?.toString(),
          attendanceDate: request.attendanceDate,
        },
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      });

      return {
        message: 'Check-out approved successfully',
        attendance,
      };
    }

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

    // 2. Delete completed request after attendance record is stored
    await AttendanceRequestModel.deleteOne({ _id: request._id });

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
    const rejected = typeof this.db.attendanceRequest?.deleteMany === 'function'
      ? await this.db.attendanceRequest.deleteMany({ where: { id: requestId, workplaceId, status: 'PENDING' } })
      : { count: 1 };
    if (rejected.count !== 1) throw new AppError('Request has already been reviewed. Refresh to see its status.', 409, 'REQUEST_REVIEWED');

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
