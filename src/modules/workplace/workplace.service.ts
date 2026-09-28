import { Types } from 'mongoose';
import { WorkplaceModel } from './workplace.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { WorkplaceJoinRequestModel } from './workplace-join-request.model';
import { UserModel } from '../auth/user.model';
import { AuditLogModel } from '../audit/audit.model';
import { AppError } from '../../middleware/errorHandler';
import { encryptToken, decryptToken, generateSecureToken } from '../../utils/crypto';

export class WorkplaceService {
  /**
   * Employer onboarding: creates a new workplace and sets the creator as EMPLOYER
   */
  async createWorkplace(ownerId: string, data: {
    name: string;
    timezone?: string;
    address?: string;
    wifiSsid?: string;
    attendanceSettings?: { requireWifi: boolean; autoCloseHour: number };
  }) {
    const user = await UserModel.findById(ownerId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    const workplace = await WorkplaceModel.create({
      name: data.name.trim(),
      ownerId: user._id,
      timezone: data.timezone || 'Asia/Kolkata',
      address: data.address?.trim(),
      wifiSsid: data.wifiSsid?.trim(),
      attendanceSettings: data.attendanceSettings || { requireWifi: false, autoCloseHour: 23 },
      status: 'ACTIVE',
    });

    // Atomically create EMPLOYER membership
    const member = await WorkplaceMemberModel.create({
      workplaceId: workplace._id,
      userId: user._id,
      role: 'EMPLOYER',
      name: user.name,
      status: 'ACTIVE',
      joinedAt: new Date(),
    });

    return {
      workplace,
      member,
    };
  }

  /**
   * List all workplaces where the user has active membership
   */
  async getMyWorkplaces(userId: string) {
    const members = await WorkplaceMemberModel.find({
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    }).populate('workplaceId');

    return members
      .filter((m) => m.workplaceId && (m.workplaceId as any).status === 'ACTIVE')
      .map((m: any) => ({
        id: m.workplaceId._id.toString(),
        name: m.workplaceId.name,
        timezone: m.workplaceId.timezone,
        address: m.workplaceId.address,
        wifiSsid: m.workplaceId.wifiSsid,
        role: m.role,
        memberId: m._id.toString(),
        employeeCode: m.employeeCode,
      }));
  }

  /**
   * Get single workplace detail
   */
  async getWorkplace(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }
    return workplace;
  }

  /**
   * Update workplace settings (EMPLOYER only)
   */
  async updateWorkplace(workplaceId: string, data: any) {
    const workplace = await WorkplaceModel.findByIdAndUpdate(
      workplaceId,
      { $set: data },
      { new: true, runValidators: true }
    );
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }
    return workplace;
  }

  /**
   * Get pending pre-added workplace invitations matching user's verified email
   */
  async getPendingInvitesForEmail(email: string) {
    if (!email) return [];

    const invites = await WorkplaceMemberModel.find({
      invitedEmail: email.toLowerCase(),
      status: 'INVITED',
    }).populate('workplaceId', 'name address timezone wifiSsid');

    return invites
      .filter((inv) => inv.workplaceId && (inv.workplaceId as any).status === 'ACTIVE')
      .map((inv: any) => ({
        invitationId: inv._id.toString(),
        workplaceId: inv.workplaceId._id.toString(),
        workplaceName: inv.workplaceId.name,
        address: inv.workplaceId.address,
        timezone: inv.workplaceId.timezone,
        employeeCode: inv.employeeCode,
        name: inv.name,
      }));
  }

  /**
   * Delete workplace and all associated memberships (owner only)
   */
  async deleteWorkplace(ownerId: string, workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace) {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }
    if (workplace.ownerId.toString() !== ownerId) {
      throw new AppError('Only the workplace owner can delete this workplace', 403, 'FORBIDDEN');
    }

    await WorkplaceMemberModel.deleteMany({ workplaceId });
    await WorkplaceModel.findByIdAndDelete(workplaceId);

    return { success: true, message: 'Workplace deleted successfully' };
  }

  /**
   * Reset all workplaces and memberships for the user to return to a clean onboarding state
   */
  async resetMyAccount(userId: string) {
    // Delete all workplaces owned by this user
    const owned = await WorkplaceModel.find({ ownerId: userId });
    for (const wp of owned) {
      await WorkplaceMemberModel.deleteMany({ workplaceId: wp._id });
      await WorkplaceModel.findByIdAndDelete(wp._id);
    }

    // Delete any other memberships for this user
    await WorkplaceMemberModel.deleteMany({ userId });

    return { success: true, message: 'Account reset for onboarding' };
  }

  /**
   * Helper to parse and decrypt join token from various scan formats
   */
  private parseJoinToken(rawInput: string): { workplaceId: string; secret?: string } {
    let tokenStr = rawInput.trim();
    // Handle attendance://join?token=... or https://...?token=...
    if (tokenStr.includes('token=')) {
      try {
        const url = new URL(tokenStr.startsWith('attendance://') ? tokenStr.replace('attendance://', 'http://dummy/') : tokenStr);
        const qToken = url.searchParams.get('token');
        if (qToken) tokenStr = qToken;
      } catch {
        const match = tokenStr.match(/token=([^&]+)/);
        if (match) tokenStr = decodeURIComponent(match[1]);
      }
    } else if (tokenStr.startsWith('{') && tokenStr.endsWith('}')) {
      try {
        const parsed = JSON.parse(tokenStr);
        if (parsed.token) tokenStr = parsed.token;
      } catch {
        // Continue with raw string
      }
    }

    try {
      const decrypted = decryptToken(tokenStr);
      const data = JSON.parse(decrypted);
      if (data.type !== 'WORKPLACE_JOIN' || !data.workplaceId) {
        throw new AppError('Invalid workplace QR code structure', 400, 'INVALID_QR_TOKEN');
      }
      return { workplaceId: data.workplaceId, secret: data.secret };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError('Invalid or unreadable QR code token. Make sure you scanned the correct employer QR.', 400, 'INVALID_QR_TOKEN');
    }
  }

  /**
   * Get secure Join QR code for workplace (EMPLOYER only)
   */
  async getJoinQr(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }

    if (!workplace.joinQrSecret) {
      workplace.joinQrSecret = generateSecureToken(16);
      await workplace.save();
    }

    const payload = {
      type: 'WORKPLACE_JOIN',
      workplaceId: workplace._id.toString(),
      secret: workplace.joinQrSecret,
      v: 1,
      ts: Date.now(),
    };

    const encryptedToken = encryptToken(JSON.stringify(payload));
    const qrPayload = `attendance://join?token=${encryptedToken}&workplace=${workplace._id}`;

    return {
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      address: workplace.address,
      qrToken: encryptedToken,
      qrPayload,
    };
  }

  /**
   * Rotate Join QR code secret (invalidating all previous QR codes)
   */
  async rotateJoinQr(workplaceId: string, actorId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }

    workplace.joinQrSecret = generateSecureToken(16);
    await workplace.save();

    return this.getJoinQr(workplaceId);
  }

  /**
   * Preview workplace details before requesting to join (Employee side)
   */
  async previewJoin(userId: string, rawToken: string) {
    const { workplaceId, secret } = this.parseJoinToken(rawToken);

    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('This workplace is inactive or does not exist', 404, 'WORKPLACE_NOT_FOUND');
    }

    if (workplace.joinQrEnabled === false) {
      throw new AppError('QR joining is disabled for this workplace', 400, 'JOIN_QR_DISABLED');
    }

    if (workplace.joinQrSecret && secret !== workplace.joinQrSecret) {
      throw new AppError('This QR code is expired or was rotated. Ask the employer for the new QR code.', 400, 'EXPIRED_QR');
    }

    // Check if user is already an ACTIVE member
    const existingMember = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    });

    // Check if user has an existing PENDING request
    const pendingRequest = await WorkplaceJoinRequestModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    });

    const activeMembersCount = await WorkplaceMemberModel.countDocuments({
      workplaceId: workplace._id,
      status: 'ACTIVE',
    });

    const owner = await UserModel.findById(workplace.ownerId);

    return {
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      address: workplace.address,
      timezone: workplace.timezone,
      ownerName: owner?.name || 'Workspace Admin',
      ownerAvatarUrl: owner?.avatarUrl,
      activeMembersCount,
      alreadyMember: Boolean(existingMember),
      pendingRequest: pendingRequest
        ? {
            id: pendingRequest._id.toString(),
            status: pendingRequest.status,
            requestedAt: pendingRequest.createdAt,
          }
        : null,
      qrToken: rawToken,
    };
  }

  /**
   * Submit a Join Request to workplace (Employee side)
   */
  async submitJoinRequest(userId: string, data: { token: string; note?: string }) {
    const { workplaceId, secret } = this.parseJoinToken(data.token);

    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
    }

    if (workplace.joinQrSecret && secret !== workplace.joinQrSecret) {
      throw new AppError('This QR code is expired or was rotated. Ask the employer for the new QR code.', 400, 'EXPIRED_QR');
    }

    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    // Check if already an active member
    const existingMember = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      userId: user._id,
      status: 'ACTIVE',
    });
    if (existingMember) {
      throw new AppError('You are already an active member of this workplace', 409, 'ALREADY_MEMBER');
    }

    // Check if already has a PENDING request
    const existingReq = await WorkplaceJoinRequestModel.findOne({
      workplaceId: workplace._id,
      userId: user._id,
      status: 'PENDING',
    });

    if (existingReq) {
      return {
        message: 'Join request is already pending employer approval',
        requestId: existingReq._id.toString(),
        status: existingReq.status,
        workplaceName: workplace.name,
        requestedAt: existingReq.createdAt,
      };
    }

    // Create new join request
    const joinReq = await WorkplaceJoinRequestModel.create({
      workplaceId: workplace._id,
      userId: user._id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      note: data.note?.trim(),
      status: 'PENDING',
    });

    await AuditLogModel.create({
      workplaceId: workplace._id,
      actorId: user._id,
      action: 'JOIN_REQUEST_SUBMITTED',
      entityId: joinReq._id.toString(),
      metadata: { name: user.name, email: user.email },
    });

    return {
      message: 'Join request submitted successfully. Awaiting employer approval.',
      requestId: joinReq._id.toString(),
      status: joinReq.status,
      workplaceName: workplace.name,
      requestedAt: joinReq.createdAt,
    };
  }

  /**
   * Get all join requests submitted by current user (Employee side)
   */
  async getMyJoinRequests(userId: string) {
    const requests = await WorkplaceJoinRequestModel.find({
      userId: new Types.ObjectId(userId),
    })
      .populate('workplaceId', 'name address timezone ownerId')
      .sort({ createdAt: -1 });

    return requests
      .filter((r) => r.workplaceId)
      .map((r: any) => ({
        id: r._id.toString(),
        workplaceId: r.workplaceId._id.toString(),
        workplaceName: r.workplaceId.name,
        address: r.workplaceId.address,
        timezone: r.workplaceId.timezone,
        status: r.status,
        note: r.note,
        rejectionReason: r.rejectionReason,
        requestedAt: r.createdAt,
        reviewedAt: r.reviewedAt,
      }));
  }

  /**
   * Cancel pending join request (Employee side)
   */
  async cancelMyJoinRequest(userId: string, requestId: string) {
    const request = await WorkplaceJoinRequestModel.findOne({
      _id: new Types.ObjectId(requestId),
      userId: new Types.ObjectId(userId),
      status: 'PENDING',
    });

    if (!request) {
      throw new AppError('Pending join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    request.status = 'CANCELLED';
    await request.save();

    return { success: true, message: 'Join request cancelled' };
  }

  /**
   * List join requests for a workplace (EMPLOYER only)
   */
  async getWorkplaceJoinRequests(workplaceId: string, status?: string) {
    const filter: any = { workplaceId: new Types.ObjectId(workplaceId) };
    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
      filter.status = status;
    }

    const requests = await WorkplaceJoinRequestModel.find(filter)
      .sort({ createdAt: -1 });

    return requests.map((r: any) => ({
      id: r._id.toString(),
      userId: r.userId?.toString(),
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      note: r.note,
      status: r.status,
      requestedAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
    }));
  }

  /**
   * Approve a join request (EMPLOYER only)
   */
  async approveJoinRequest(
    workplaceId: string,
    actorId: string,
    requestId: string,
    data?: { employeeCode?: string }
  ) {
    const joinReq = await WorkplaceJoinRequestModel.findOne({
      _id: new Types.ObjectId(requestId),
      workplaceId: new Types.ObjectId(workplaceId),
      status: 'PENDING',
    });

    if (!joinReq) {
      throw new AppError('Pending join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    // Determine employee code
    let code = data?.employeeCode ? data.employeeCode.trim().toUpperCase() : null;
    if (!code) {
      const count = await WorkplaceMemberModel.countDocuments({
        workplaceId: new Types.ObjectId(workplaceId),
      });
      code = `EMP-${1000 + count + 1}`;
    }

    // Check if membership already exists (e.g. was invited previously or inactive)
    let member = await WorkplaceMemberModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      userId: joinReq.userId,
    });

    if (member) {
      member.status = 'ACTIVE';
      member.role = 'EMPLOYEE';
      member.name = joinReq.name;
      member.joinedAt = new Date();
      if (!member.employeeCode) member.employeeCode = code;
      await member.save();
    } else {
      member = await WorkplaceMemberModel.create({
        workplaceId: new Types.ObjectId(workplaceId),
        userId: joinReq.userId,
        role: 'EMPLOYEE',
        name: joinReq.name,
        invitedEmail: joinReq.email,
        employeeCode: code,
        status: 'ACTIVE',
        joinedAt: new Date(),
      });
    }

    joinReq.status = 'APPROVED';
    joinReq.reviewedBy = new Types.ObjectId(actorId);
    joinReq.reviewedAt = new Date();
    await joinReq.save();

    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'JOIN_REQUEST_APPROVED',
      entityId: joinReq._id.toString(),
      metadata: { userId: joinReq.userId.toString(), employeeCode: code },
    });

    return {
      message: 'Join request approved successfully',
      memberId: member._id.toString(),
      employeeCode: member.employeeCode,
      name: member.name,
    };
  }

  /**
   * Reject a join request (EMPLOYER only)
   */
  async rejectJoinRequest(
    workplaceId: string,
    actorId: string,
    requestId: string,
    data?: { reason?: string }
  ) {
    const joinReq = await WorkplaceJoinRequestModel.findOne({
      _id: new Types.ObjectId(requestId),
      workplaceId: new Types.ObjectId(workplaceId),
      status: 'PENDING',
    });

    if (!joinReq) {
      throw new AppError('Pending join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    joinReq.status = 'REJECTED';
    joinReq.reviewedBy = new Types.ObjectId(actorId);
    joinReq.reviewedAt = new Date();
    joinReq.rejectionReason = data?.reason?.trim();
    await joinReq.save();

    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'JOIN_REQUEST_REJECTED',
      entityId: joinReq._id.toString(),
      metadata: { userId: joinReq.userId.toString(), reason: data?.reason },
    });

    return {
      message: 'Join request rejected',
      requestId: joinReq._id.toString(),
    };
  }
}

export const workplaceService = new WorkplaceService();
