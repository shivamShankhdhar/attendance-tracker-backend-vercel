import { Types } from 'mongoose';
import { AttendanceSessionModel, IAttendanceSession } from './attendance-session.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { AuditLogModel } from '../audit/audit.model';
import { generateSecureToken, hashToken, encryptToken, decryptToken } from '../../utils/crypto';
import { getWorkplaceLocalDate } from '../../utils/date';
import { AppError } from '../../middleware/errorHandler';

export class AttendanceSessionService {
  /**
   * Open or retrieve today's active attendance session with secure QR token
   */
  async openTodaySession(workplaceId: string, actorId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
    }

    const todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone);

    // Check if session already exists for today
    let session = await AttendanceSessionModel.findOne({
      workplaceId: workplace._id,
      attendanceDate: todayDate,
    });

    if (session) {
      if (session.status === 'CLOSED') {
        throw new AppError('Today attendance session was already closed', 400, 'SESSION_ALREADY_CLOSED');
      }

      // Decrypt the existing token so employer sees the identical QR
      const decryptedToken = decryptToken(session.encryptedQrToken);
      return {
        session: {
          id: session._id.toString(),
          workplaceId: session.workplaceId.toString(),
          attendanceDate: session.attendanceDate,
          status: session.status,
          openedAt: session.openedAt,
          expiresAt: session.expiresAt,
        },
        qrToken: decryptedToken,
        qrPayload: `attendance://checkin?token=${decryptedToken}&workplace=${workplace._id}`,
      };
    }

    // Generate new secure random token
    const rawQrToken = generateSecureToken(32);
    const qrTokenHash = hashToken(rawQrToken);
    const encryptedQrToken = encryptToken(rawQrToken);

    // Calculate expiry (end of today or autoCloseHour in workplace local time)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 18 * 60 * 60 * 1000); // 18 hours max session life

    session = await AttendanceSessionModel.create({
      workplaceId: workplace._id,
      createdBy: new Types.ObjectId(actorId),
      attendanceDate: todayDate,
      qrTokenHash,
      encryptedQrToken,
      status: 'OPEN',
      openedAt: now,
      expiresAt,
    });

    await AuditLogModel.create({
      workplaceId: workplace._id,
      actorId: new Types.ObjectId(actorId),
      action: 'ATTENDANCE_SESSION_OPENED',
      entityId: session._id.toString(),
      metadata: { attendanceDate: todayDate },
    });

    return {
      session: {
        id: session._id.toString(),
        workplaceId: session.workplaceId.toString(),
        attendanceDate: session.attendanceDate,
        status: session.status,
        openedAt: session.openedAt,
        expiresAt: session.expiresAt,
      },
      qrToken: rawQrToken,
      qrPayload: `attendance://checkin?token=${rawQrToken}&workplace=${workplace._id}`,
    };
  }

  /**
   * Get today's attendance session
   */
  async getTodaySession(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone);

    const session = await AttendanceSessionModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      attendanceDate: todayDate,
    });

    if (!session) {
      return null;
    }

    let rawQrToken: string | null = null;
    if (session.status === 'OPEN') {
      try {
        rawQrToken = decryptToken(session.encryptedQrToken);
      } catch {
        rawQrToken = null;
      }
    }

    const sessionObj = {
      id: session._id.toString(),
      workplaceId: session.workplaceId.toString(),
      attendanceDate: session.attendanceDate,
      status: session.status,
      openedAt: session.openedAt,
      expiresAt: session.expiresAt,
    };

    return {
      session: sessionObj,
      ...sessionObj,
      qrToken: rawQrToken,
      qrPayload: rawQrToken ? `attendance://checkin?token=${rawQrToken}&workplace=${workplace._id}` : null,
    };
  }

  /**
   * Manually close today's session
   */
  async closeSession(workplaceId: string, actorId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');

    const todayDate = getWorkplaceLocalDate(new Date(), workplace.timezone);

    const session = await AttendanceSessionModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      attendanceDate: todayDate,
      status: 'OPEN',
    });

    if (!session) {
      throw new AppError('No open attendance session found for today', 404, 'NO_OPEN_SESSION');
    }

    session.status = 'CLOSED';
    await session.save();

    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'ATTENDANCE_SESSION_CLOSED',
      entityId: session._id.toString(),
      metadata: { attendanceDate: todayDate },
    });

    return { message: 'Attendance session closed successfully' };
  }
}

export const attendanceSessionService = new AttendanceSessionService();
