import crypto from 'crypto';
import { env } from '../../config/env';
import { createDeferredInviteLink } from './workplace-links';
import { NotificationOutboxModel } from '../notification/notification.model';
import { Types, connection } from 'mongoose';
import { WorkplaceModel } from './workplace.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { TeamModel } from '../team/team.model';
import { WorkplaceJoinRequestModel } from './workplace-join-request.model';
import { UserModel } from '../auth/user.model';
import { AuditLogModel } from '../audit/audit.model';
import { AppError } from '../../middleware/errorHandler';
import { decryptToken, generateSecureToken, hashToken } from '../../utils/crypto';

/**
 * Generate cryptographically unique Workplace ID in strict BWP-****-*** format (e.g. BWP-1234-567)
 */
export function generateWorkplaceCode(): string {
  const segment1 = Math.floor(1000 + crypto.randomInt(9000)).toString();
  const segment2 = Math.floor(100 + crypto.randomInt(900)).toString();
  return `BWP-${segment1}-${segment2}`;
}

export function formatWorkplaceCode(wp: { workplaceCode?: string; _id?: any }): string {
  if (wp.workplaceCode && /^BWP-\d{4}-\d{3}$/.test(wp.workplaceCode)) {
    return wp.workplaceCode;
  }
  if (wp.workplaceCode) {
    return wp.workplaceCode;
  }
  const idStr = wp._id ? wp._id.toString() : '';
  const hash = crypto.createHash('sha256').update(idStr).digest('hex');
  const num1 = ((parseInt(hash.slice(0, 8), 16) % 9000) + 1000).toString();
  const num2 = ((parseInt(hash.slice(8, 16), 16) % 900) + 100).toString();
  return `BWP-${num1}-${num2}`;
}

export class WorkplaceService {
  /**
   * Employer onboarding: creates a new workplace, generates BWP-****-*** code, sets the creator as EMPLOYER,
   * and auto-creates the default "General" team for Workplace -> Team -> Team Members hierarchy.
   */
  async createWorkplace(ownerId: string, data: {
    name: string;
    timezone?: string;
    address?: string;
    description?: string;
    wifiSsid?: string;
    attendanceSettings?: { requireWifi: boolean; autoCloseHour: number };
  }) {
    const user = await UserModel.findById(ownerId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    // Generate unique BWP-****-*** code
    let workplaceCode = generateWorkplaceCode();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 25) {
      attempts++;
      const existing = await WorkplaceModel.findOne({ workplaceCode });
      if (!existing) {
        isUnique = true;
      } else {
        workplaceCode = generateWorkplaceCode();
      }
    }

    const workplace = await WorkplaceModel.create({
      name: data.name.trim(),
      workplaceCode,
      ownerId: user._id,
      timezone: data.timezone || 'Asia/Kolkata',
      address: data.address?.trim(),
      description: data.description?.trim(),
      wifiSsid: data.wifiSsid?.trim(),
      attendanceSettings: data.attendanceSettings || { requireWifi: false, autoCloseHour: 23 },
      status: 'ACTIVE',
    });

    // Auto-create initial default Team for hierarchy
    const defaultTeam = await TeamModel.create({
      workplaceId: workplace._id,
      name: 'General',
      description: 'Default team',
      color: '#5B692D',
      isDefault: true,
    });

    // Atomically create EMPLOYER membership assigned to default team
    const member = await WorkplaceMemberModel.create({
      workplaceId: workplace._id,
      userId: user._id,
      teamId: defaultTeam._id,
      role: 'EMPLOYER',
      name: user.name,
      status: 'ACTIVE',
      joinedAt: new Date(),
    });

    return {
      workplace,
      member,
      team: defaultTeam,
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

    const activeMembers = members.filter((m) => m.workplaceId && (m.workplaceId as any).status === 'ACTIVE');
    const workplaceIds = activeMembers.map((m) => (m.workplaceId as any)._id);

    const memberCounts = await WorkplaceMemberModel.aggregate([
      { $match: { workplaceId: { $in: workplaceIds }, role: 'EMPLOYEE', status: 'ACTIVE' } },
      { $group: { _id: '$workplaceId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>();
    for (const mc of memberCounts) {
      countMap.set(mc._id.toString(), mc.count);
    }

    return activeMembers
      .map((m: any) => {
        const wp = m.workplaceId as any;
        const wpIdStr = wp._id.toString();
        return {
          id: wpIdStr,
          name: wp.name,
          code: formatWorkplaceCode(wp),
          timezone: wp.timezone,
          address: wp.address,
          wifiSsid: wp.wifiSsid,
          role: m.role,
          memberId: m._id.toString(),
          employeeCode: m.employeeCode,
          memberCount: countMap.get(wpIdStr) || 1,
          createdAt: wp.createdAt || m.createdAt,
          joinedAt: m.joinedAt,
        };
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  /**
   * Get single workplace detail
   */
  async getWorkplace(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }
    const memberCount = await WorkplaceMemberModel.countDocuments({ workplaceId: workplace._id, role: 'EMPLOYEE', status: 'ACTIVE' });
    return {
      id: workplace._id.toString(),
      name: workplace.name,
      code: formatWorkplaceCode(workplace),
      address: workplace.address,
      timezone: workplace.timezone,
      memberCount,
      createdAt: workplace.createdAt,
      attendanceSettings: workplace.attendanceSettings,
    };
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
  private async parseJoinToken(rawInput: string): Promise<{ workplaceId: string; secret?: string; isCodeLookup?: boolean }> {
    let tokenStr = rawInput.trim();
    // Handle surrounding quotes
    tokenStr = tokenStr.replace(/^["']|["']$/g, '').trim();

    // Handle custom app schemes like bizora://join/509e-250a8 or bizora://join?token=...
    if (tokenStr.startsWith('bizora://')) {
      const pathPart = tokenStr.replace(/^bizora:\/\/join\/?/, '').replace(/^bizora:\/\//, '');
      if (pathPart && !pathPart.includes('?') && !pathPart.includes('=')) {
        tokenStr = decodeURIComponent(pathPart);
      }
    }

    // Handle bizora://join?token=... or ?code=... or https://...?token=...
    if (tokenStr.includes('token=') || tokenStr.includes('code=') || tokenStr.includes('invite=')) {
      try {
        const normalized = tokenStr.replace(/^[a-zA-Z0-9+-.]+:\/\//, 'http://dummy/');
        const url = new URL(normalized);
        const qToken = url.searchParams.get('token') || url.searchParams.get('code') || url.searchParams.get('invite');
        if (qToken) tokenStr = qToken;
      } catch {
        const match = tokenStr.match(/(?:token|code|invite)=([^&]+)/);
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
      const url = new URL(tokenStr.replace(/^[a-zA-Z0-9+-.]+:\/\//, 'http://dummy/'));
      const match = url.pathname.match(/\/join\/([^/]+)\/?$/) || url.pathname.match(/\/([^/]+)\/?$/);
      if (match && match[1] !== 'dummy') tokenStr = decodeURIComponent(match[1]);
    } catch { /* Raw token or workplace code. */ }

    // 0a. Direct lookup in WorkplaceModel (matches active workplace short code, legacy token, or previous tokens)
    const directWorkplace = await WorkplaceModel.findOne({
      $or: [
        { joinInviteToken: tokenStr.toLowerCase() },
        { previousJoinTokens: tokenStr.toLowerCase() },
        { joinInviteToken: tokenStr },
        { previousJoinTokens: tokenStr },
      ],
      status: 'ACTIVE',
    });
    if (directWorkplace) {
      return { workplaceId: directWorkplace._id.toString(), secret: directWorkplace.joinQrSecret };
    }

    // 0b. Direct lookup in WorkplaceMemberModel for exact invitation code or hash
    const directMember = await WorkplaceMemberModel.findOne({
      $and: [
        {
          $or: [
            { invitationCode: tokenStr.toLowerCase() },
            { invitationCode: tokenStr },
            { invitationTokenHash: hashToken(tokenStr.toLowerCase()) },
            { invitationTokenHash: hashToken(tokenStr) },
          ],
        },
        {
          $or: [
            { invitationExpiresAt: { $gt: new Date() } },
            { invitationExpiresAt: { $exists: false } },
          ],
        },
      ],
    });
    if (directMember) {
      const wp = await WorkplaceModel.findById(directMember.workplaceId);
      if (wp) {
        return { workplaceId: wp._id.toString(), secret: wp.joinQrSecret, isCodeLookup: true };
      }
    }

    // Check if token has structured employee invite format:
    // {workplaceId}-{employeeId} (10 chars e.g. e912-be91c) or legacy {wpId}-{empId}-{timestamp}
    const tokenParts = tokenStr.split('-');
    if (tokenParts.length === 2) {
      const [wpPart, empPart] = tokenParts;
      const member = await WorkplaceMemberModel.findOne({
        $and: [
          {
            $or: [
              { invitationCode: tokenStr.toLowerCase() },
              { invitationTokenHash: hashToken(tokenStr.toLowerCase()) },
              { invitationTokenHash: hashToken(tokenStr) },
              {
                $expr: {
                  $and: [
                    { $regexMatch: { input: { $toString: '$_id' }, regex: `${empPart}$`, options: 'i' } },
                    { $regexMatch: { input: { $toString: '$workplaceId' }, regex: `${wpPart}$`, options: 'i' } },
                  ],
                },
              },
            ],
          },
          {
            $or: [
              { invitationExpiresAt: { $gt: new Date() } },
              { invitationExpiresAt: { $exists: false } },
            ],
          },
        ],
      });
      if (member) {
        const wp = await WorkplaceModel.findById(member.workplaceId);
        if (wp) {
          return { workplaceId: wp._id.toString(), secret: wp.joinQrSecret, isCodeLookup: true };
        }
      }
    } else if (tokenParts.length >= 3 && Types.ObjectId.isValid(tokenParts[0]) && Types.ObjectId.isValid(tokenParts[1])) {
      const [wpId, empId] = tokenParts;
      const member = await WorkplaceMemberModel.findOne({
        _id: new Types.ObjectId(empId),
        workplaceId: new Types.ObjectId(wpId),
        $or: [
          { invitationExpiresAt: { $gt: new Date() } },
          { invitationExpiresAt: { $exists: false } },
        ],
      });
      if (member) {
        const wp = await WorkplaceModel.findById(member.workplaceId);
        if (wp) {
          return { workplaceId: wp._id.toString(), secret: wp.joinQrSecret, isCodeLookup: true };
        }
      }
      const directWp = await WorkplaceModel.findById(wpId);
      if (directWp) {
        return { workplaceId: directWp._id.toString(), secret: directWp.joinQrSecret, isCodeLookup: true };
      }
    }

    if (/^[a-f0-9]{64}$/.test(tokenStr)) {
      const invited = await WorkplaceModel.findOne({ joinInviteToken: tokenStr });
      if (!invited) throw new AppError('This invitation is invalid or has been replaced.', 404, 'INVALID_QR_TOKEN');
      return { workplaceId: invited._id.toString(), secret: invited.joinQrSecret };
    }

    // Check if token matches an employee-specific invitation token
    const memberInvite = await WorkplaceMemberModel.findOne({
      $or: [
        { invitationTokenHash: hashToken(tokenStr) },
        { invitationTokenHash: tokenStr },
      ],
      invitationExpiresAt: { $gt: new Date() },
    });
    if (memberInvite) {
      const wp = await WorkplaceModel.findById(memberInvite.workplaceId);
      if (wp) {
        return { workplaceId: wp._id.toString(), secret: wp.joinQrSecret, isCodeLookup: true };
      }
    }

    // 1. Try decrypting as standard encrypted QR/join token
    try {
      const decrypted = decryptToken(tokenStr);
      const data = JSON.parse(decrypted);
      if (data.type === 'WORKPLACE_JOIN' && data.workplaceId) {
        return { workplaceId: data.workplaceId, secret: data.secret };
      }
    } catch {
      // Fall through to 6-char code / ID matching
    }

    // 2. Try looking up by 6-char workplace code suffix or ObjectId
    const cleanCode = tokenStr.replace(/[^a-zA-Z0-9]/g, '');
    if (cleanCode.length === 6 && /^[a-fA-F0-9]{6}$/.test(cleanCode)) {
      const activeWorkplaces = await WorkplaceModel.find({ status: 'ACTIVE' });
      const matched = activeWorkplaces.find((w) => w._id.toString().toLowerCase().endsWith(cleanCode.toLowerCase()));
      if (matched) {
        return { workplaceId: matched._id.toString(), isCodeLookup: true };
      }
    } else if (Types.ObjectId.isValid(cleanCode)) {
      const matched = await WorkplaceModel.findOne({ _id: cleanCode, status: 'ACTIVE' });
      if (matched) {
        return { workplaceId: matched._id.toString(), isCodeLookup: true };
      }
    }

    throw new AppError('Invalid or unreadable invite link or code. Make sure you have the correct workplace invite.', 400, 'INVALID_QR_TOKEN');
  }

  /**
   * Generate unique short 6 to 8 character workplace invitation code with '-' in between
   * e.g. '509-250' (7 chars) or '509-250a' (8 chars)
   */
  private async generateShortWorkplaceInviteCode(workplaceId: string): Promise<string> {
    const wpPart = workplaceId.slice(-3).toLowerCase();
    for (let attempt = 0; attempt < 25; attempt++) {
      const rndLen = attempt > 12 ? 4 : 3;
      const rnd = crypto.randomBytes(2).toString('hex').slice(0, rndLen).toLowerCase();
      const candidate = `${wpPart}-${rnd}`;
      const conflict = await WorkplaceModel.findOne({
        $or: [
          { joinInviteToken: candidate },
          { previousJoinTokens: candidate },
        ],
      });
      if (!conflict) {
        return candidate;
      }
    }
    return `${workplaceId.slice(-4).toLowerCase()}-${crypto.randomBytes(2).toString('hex').slice(0, 3).toLowerCase()}`;
  }

  /**
   * Get secure Join QR code for workplace (EMPLOYER only)
   */
  async getJoinQr(workplaceId: string) {
    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('Workplace not found', 404, 'WORKPLACE_NOT_FOUND');
    }

    // Ensure joinInviteToken exists and is in the modern short format (<= 8 chars, with '-')
    const isOldLongToken = workplace.joinInviteToken && (workplace.joinInviteToken.length > 8 || !workplace.joinInviteToken.includes('-'));
    if (!workplace.joinInviteToken || isOldLongToken) {
      const shortToken = await this.generateShortWorkplaceInviteCode(workplace._id.toString());
      const updateDoc: any = {
        $set: {
          joinInviteToken: shortToken,
          ...(workplace.joinQrSecret ? {} : { joinQrSecret: generateSecureToken(16) }),
        },
      };
      if (workplace.joinInviteToken) {
        updateDoc.$addToSet = { previousJoinTokens: workplace.joinInviteToken };
      }
      await WorkplaceModel.updateOne({ _id: workplace._id }, updateDoc);
    }
    const current = await WorkplaceModel.findById(workplace._id).orFail();
    const encryptedToken = current.joinInviteToken!;
    const deepLink = `bizora://join/${encodeURIComponent(encryptedToken)}`;
    const landing = new URL(env.WORKPLACE_JOIN_URL);
    landing.pathname = `${landing.pathname.replace(/\/$/, '')}/${encodeURIComponent(encryptedToken)}`;
    landing.search = '';
    const canonicalLink = landing.toString();

    let joinLink = canonicalLink;
    if (process.env.BRANCH_KEY) {
      if (current.joinShareUrl && current.joinShareUrl.startsWith('https://')) {
        joinLink = current.joinShareUrl;
      } else {
        joinLink = await createDeferredInviteLink(encryptedToken, workplace.name, canonicalLink);
        await WorkplaceModel.updateOne({ _id: current._id, joinInviteToken: encryptedToken }, { $set: { joinShareUrl: joinLink } });
      }
    } else {
      // Invalidate and fix any stale domain previously stored in joinShareUrl
      if (current.joinShareUrl !== canonicalLink) {
        await WorkplaceModel.updateOne({ _id: current._id }, { $set: { joinShareUrl: canonicalLink } });
      }
      joinLink = canonicalLink;
    }
    const qrPayload = joinLink;

    return {
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      address: workplace.address,
      qrToken: encryptedToken,
      qrPayload,
      deepLink,
      joinLink,
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

    const shortToken = await this.generateShortWorkplaceInviteCode(workplace._id.toString());
    workplace.joinQrSecret = generateSecureToken(16);
    workplace.joinInviteToken = shortToken;
    // When rotating, intentionally invalidate previous tokens
    workplace.previousJoinTokens = [];
    workplace.joinShareUrl = undefined;
    await workplace.save();

    return this.getJoinQr(workplaceId);
  }

  /**
   * Preview workplace details before requesting to join (Employee side)
   */
  private async resolveJoinWorkplace(rawToken: string) {
    const { workplaceId, secret, isCodeLookup } = await this.parseJoinToken(rawToken);

    const workplace = await WorkplaceModel.findById(workplaceId);
    if (!workplace || workplace.status !== 'ACTIVE') {
      throw new AppError('This workplace is inactive or does not exist', 404, 'WORKPLACE_NOT_FOUND');
    }

    if (workplace.joinQrEnabled === false) {
      throw new AppError('Joining is disabled for this workplace', 400, 'JOIN_QR_DISABLED');
    }

    if (!isCodeLookup && workplace.joinQrSecret && secret !== workplace.joinQrSecret) {
      throw new AppError('This invite link is expired or was rotated. Ask the employer for a new link.', 400, 'EXPIRED_QR');
    }

    return workplace;
  }

  async publicJoinPreview(rawToken: string, includeOwner = false) {
    const workplace = await this.resolveJoinWorkplace(rawToken);
    let installLink = workplace.joinShareUrl;
    if (!installLink && workplace.joinInviteToken) {
      const landing = new URL(env.WORKPLACE_JOIN_URL);
      landing.pathname = `${landing.pathname.replace(/\/$/, '')}/${encodeURIComponent(workplace.joinInviteToken)}`;
      landing.search = '';
      installLink = landing.toString();
    }

    const baseResult: any = {
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      workplaceCode: formatWorkplaceCode(workplace),
      address: workplace.address,
      description: workplace.description,
      installLink,
    };

    if (includeOwner) {
      const [owner, activeMembersCount] = await Promise.all([
        UserModel.findById(workplace.ownerId).select('name'),
        WorkplaceMemberModel.countDocuments({
          workplaceId: workplace._id,
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        }),
      ]);
      baseResult.ownerName = owner?.name || 'Workplace Admin';
      baseResult.activeMembersCount = activeMembersCount;
    }

    return baseResult;
  }

  async previewJoin(userId: string, rawToken: string) {
    const workplace = await this.resolveJoinWorkplace(rawToken);

    // Check if user is already an ACTIVE member
    const existingMember = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: 'ACTIVE',
    });

    // Check if user has an INVITED membership (directly added by employer)
    const userDoc = await UserModel.findById(userId);
    let invitedMember = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      $or: [
        ...(userDoc?.email ? [{ invitedEmail: userDoc.email.toLowerCase() }] : []),
        { userId: new Types.ObjectId(userId) },
      ],
      status: 'INVITED',
    });

    if (!invitedMember && rawToken) {
      const cleanToken = rawToken.trim();
      const parts = cleanToken.split('-');
      if (parts.length === 2) {
        const [wpPart, empPart] = parts;
        invitedMember = await WorkplaceMemberModel.findOne({
          workplaceId: workplace._id,
          $or: [
            { invitationCode: cleanToken.toLowerCase() },
            { invitationTokenHash: hashToken(cleanToken.toLowerCase()) },
            {
              $expr: {
                $regexMatch: { input: { $toString: '$_id' }, regex: `${empPart}$`, options: 'i' },
              },
            },
          ],
          status: 'INVITED',
        });
      } else if (parts.length >= 3 && Types.ObjectId.isValid(parts[1])) {
        invitedMember = await WorkplaceMemberModel.findOne({
          _id: new Types.ObjectId(parts[1]),
          workplaceId: workplace._id,
          status: 'INVITED',
        });
      }
      if (!invitedMember) {
        invitedMember = await WorkplaceMemberModel.findOne({
          workplaceId: workplace._id,
          $or: [
            { invitationCode: cleanToken.toLowerCase() },
            { invitationTokenHash: hashToken(cleanToken.toLowerCase()) },
            { invitationTokenHash: hashToken(cleanToken) },
          ],
          status: 'INVITED',
        });
      }
    }

    // Check if user has an existing PENDING request
    const pendingRequest = await WorkplaceJoinRequestModel.findOne({
      workplaceId: workplace._id,
      userId: new Types.ObjectId(userId),
      status: { $ne: 'CANCELLED' },
    }).sort({ createdAt: -1 });

    const activeMembersCount = await WorkplaceMemberModel.countDocuments({
      workplaceId: workplace._id,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    const isOwner = workplace.ownerId.toString() === userId.toString();
    const isEmployer = Boolean(existingMember && existingMember.role === 'EMPLOYER') || isOwner;

    const owner = await UserModel.findById(workplace.ownerId);

    return {
      workplaceId: workplace._id.toString(),
      workplaceName: workplace.name,
      workplaceCode: formatWorkplaceCode(workplace),
      address: workplace.address,
      description: workplace.description,
      timezone: workplace.timezone,
      ownerName: owner?.name || 'Workplace Admin',
      ownerAvatarUrl: owner?.avatarUrl,
      activeMembersCount,
      alreadyMember: Boolean(existingMember) || isOwner,
      isOwner,
      isEmployer,
      isInvited: Boolean(invitedMember) && !isOwner,
      invitedRole: invitedMember?.role || 'EMPLOYEE',
      latestRequest: pendingRequest ? { id: pendingRequest._id.toString(), status: pendingRequest.status, requestedAt: pendingRequest.createdAt, reviewedAt: pendingRequest.reviewedAt, rejectionReason: pendingRequest.rejectionReason } : null,
      pendingRequest: pendingRequest?.status === 'PENDING'
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
    const workplace = await this.resolveJoinWorkplace(data.token);

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

    // If user is already an INVITED member added manually by the employer, directly join!
    // No employer approval is needed!
    let invitedMember = await WorkplaceMemberModel.findOne({
      workplaceId: workplace._id,
      $or: [
        ...(user.email ? [{ invitedEmail: user.email.toLowerCase() }] : []),
        { userId: user._id },
      ],
      status: 'INVITED',
    });

    if (!invitedMember && data.token) {
      const cleanToken = data.token.trim();
      const parts = cleanToken.split('-');
      if (parts.length === 2) {
        const [wpPart, empPart] = parts;
        invitedMember = await WorkplaceMemberModel.findOne({
          workplaceId: workplace._id,
          $or: [
            { invitationCode: cleanToken.toLowerCase() },
            { invitationTokenHash: hashToken(cleanToken.toLowerCase()) },
            {
              $expr: {
                $regexMatch: { input: { $toString: '$_id' }, regex: `${empPart}$`, options: 'i' },
              },
            },
          ],
          status: 'INVITED',
        });
      } else if (parts.length >= 3 && Types.ObjectId.isValid(parts[1])) {
        invitedMember = await WorkplaceMemberModel.findOne({
          _id: new Types.ObjectId(parts[1]),
          workplaceId: workplace._id,
          status: 'INVITED',
        });
      }
      if (!invitedMember) {
        invitedMember = await WorkplaceMemberModel.findOne({
          workplaceId: workplace._id,
          $or: [
            { invitationCode: cleanToken.toLowerCase() },
            { invitationTokenHash: hashToken(cleanToken.toLowerCase()) },
            { invitationTokenHash: hashToken(cleanToken) },
          ],
          status: 'INVITED',
        });
      }
    }

    if (invitedMember) {
      invitedMember.userId = user._id;
      invitedMember.status = 'ACTIVE';
      invitedMember.joinedAt = new Date();
      invitedMember.invitationCode = undefined;
      invitedMember.invitationTokenHash = undefined;
      await invitedMember.save();

      await WorkplaceJoinRequestModel.updateMany(
        { workplaceId: workplace._id, userId: user._id, status: 'PENDING' },
        { $set: { status: 'APPROVED', reviewedAt: new Date() } }
      );

      await AuditLogModel.create({
        workplaceId: workplace._id,
        actorId: user._id,
        action: 'INVITATION_CLAIMED',
        entityId: invitedMember._id.toString(),
      });

      return {
        message: 'Joined workplace successfully! No approval needed.',
        requestId: 'direct-invited',
        status: 'APPROVED',
        workplaceName: workplace.name,
        alreadyMember: true,
        autoApproved: true,
        workplaceId: workplace._id.toString(),
      };
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

    // The unique pending index prevents duplicate requests on rapid taps/retries.
    let joinReq: any;
    try {
      joinReq = await WorkplaceJoinRequestModel.findOneAndUpdate({ workplaceId: workplace._id, userId: user._id, status: 'PENDING' }, { $setOnInsert: {
        workplaceId: workplace._id,
        userId: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        note: data.note?.trim(),
        status: 'PENDING',
      } }, { upsert: true, new: true, runValidators: true });
    } catch (err: any) {
      if (err.code === 11000) {
        joinReq = await WorkplaceJoinRequestModel.findOne({ workplaceId: workplace._id, userId: user._id, status: 'PENDING' });
      } else {
        throw err;
      }
    }

    await AuditLogModel.create({
      workplaceId: workplace._id,
      actorId: user._id,
      action: 'JOIN_REQUEST_SUBMITTED',
      entityId: joinReq._id.toString(),
      metadata: { name: user.name, email: user.email },
    });

    await NotificationOutboxModel.updateOne({ eventId: `join:${joinReq._id}:pending` }, { $setOnInsert: { recipientId: workplace.ownerId, workplaceId: workplace._id, kind: 'JOIN_REQUESTED', title: 'New join request', body: `${user.name} requested to join ${workplace.name}.`, data: { type: 'JOIN_REQUESTED', workplaceId: workplace._id.toString(), requestId: joinReq._id.toString() } } }, { upsert: true });

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

  async getMyJoinRequest(userId: string, requestId: string) {
    if (!Types.ObjectId.isValid(requestId)) throw new AppError('Request not found', 404, 'REQUEST_NOT_FOUND');
    const request = await WorkplaceJoinRequestModel.findOne({ _id: requestId, userId });
    if (!request) throw new AppError('Request not found', 404, 'REQUEST_NOT_FOUND');
    const workplace = await WorkplaceModel.findById(request.workplaceId);
    if (!workplace) throw new AppError('Workplace no longer available', 404, 'WORKPLACE_NOT_FOUND');
    const [owner, activeMembersCount, member] = await Promise.all([
      UserModel.findById(workplace.ownerId),
      WorkplaceMemberModel.countDocuments({ workplaceId: workplace._id, role: 'EMPLOYEE', status: 'ACTIVE' }),
      WorkplaceMemberModel.findOne({ workplaceId: workplace._id, userId, status: 'ACTIVE' }),
    ]);
    return {
      workplaceId: workplace._id.toString(), workplaceName: workplace.name, description: workplace.description,
      address: workplace.address, timezone: workplace.timezone, ownerName: owner?.name || 'Workplace Admin',
      activeMembersCount, alreadyMember: Boolean(member) && workplace.status === 'ACTIVE',
      latestRequest: { id: request._id.toString(), status: request.status, requestedAt: request.createdAt,
        reviewedAt: request.reviewedAt, rejectionReason: request.rejectionReason },
      pendingRequest: null,
    };
  }

  /**
   * Cancel pending join request (Employee side)
   */
  async cancelMyJoinRequest(userId: string, requestId: string) {
    const request = await WorkplaceJoinRequestModel.findOneAndUpdate({
      _id: requestId, userId, status: 'PENDING',
    }, { $set: { status: 'CANCELLED' } }, { new: true });
    if (!request) throw new AppError('Pending join request not found', 409, 'REQUEST_ALREADY_REVIEWED');

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
      employeeCode: r.employeeCode,
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
    return connection.transaction(async (session) => {
      const joinReq = await WorkplaceJoinRequestModel.findOneAndUpdate(
        { _id: requestId, workplaceId, status: 'PENDING' },
        { $set: { status: 'APPROVED', reviewedBy: actorId, reviewedAt: new Date() } },
        { new: true, session }
      );
      if (!joinReq) throw new AppError('This request has already been reviewed or cancelled.', 409, 'REQUEST_ALREADY_REVIEWED');
      const workplace = await WorkplaceModel.findOne({ _id: workplaceId, status: 'ACTIVE' }).session(session);
      if (!workplace) throw new AppError('Workplace is unavailable', 404, 'WORKPLACE_NOT_FOUND');
      let member = await WorkplaceMemberModel.findOne({ workplaceId, $or: [
        { userId: joinReq.userId },
        ...(joinReq.email ? [{ invitedEmail: joinReq.email.toLowerCase(), userId: { $exists: false } }] : []),
      ] }).session(session);
      const code = data?.employeeCode?.trim().toUpperCase() || member?.employeeCode || joinReq.employeeCode || `EMP-${generateSecureToken(5).toUpperCase()}`;
      if (member) {
        member.status = 'ACTIVE';
        member.userId = joinReq.userId;
        member.name = joinReq.name;
        member.employeeCode = code;
        member.joinedAt = new Date();
        await member.save({ session });
      } else {
        [member] = await WorkplaceMemberModel.create([{ workplaceId, userId: joinReq.userId, role: 'EMPLOYEE',
          name: joinReq.name, ...(joinReq.email ? { invitedEmail: joinReq.email } : {}), employeeCode: code,
          status: 'ACTIVE', joinedAt: new Date() }], { session });
      }
      await NotificationOutboxModel.create([{ eventId: `join:${joinReq._id}:approved`, recipientId: joinReq.userId,
        workplaceId, kind: 'JOIN_APPROVED', title: 'Join request approved', body: `Your request to join ${workplace.name} was approved!`,
        data: { type: 'JOIN_APPROVED', requestId: joinReq._id.toString(), workplaceId } }], { session });
      await AuditLogModel.create([{ workplaceId, actorId, action: 'JOIN_REQUEST_APPROVED', entityId: joinReq._id.toString(),
        metadata: { userId: joinReq.userId.toString(), employeeCode: code } }], { session });
      return { message: 'Join request approved successfully', memberId: member._id.toString(), employeeCode: member.employeeCode, name: member.name };
    });
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
    return connection.transaction(async (session) => {
      const joinReq = await WorkplaceJoinRequestModel.findOneAndUpdate(
        { _id: requestId, workplaceId, status: 'PENDING' },
        { $set: { status: 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), rejectionReason: data?.reason?.trim() } },
        { new: true, session }
      );
      if (!joinReq) throw new AppError('This request has already been reviewed or cancelled.', 409, 'REQUEST_ALREADY_REVIEWED');
      const workplace = await WorkplaceModel.findById(workplaceId).session(session);
      await NotificationOutboxModel.create([{ eventId: `join:${joinReq._id}:rejected`, recipientId: joinReq.userId,
        workplaceId, kind: 'JOIN_REJECTED', title: 'Join request not approved', body: `Your request to join ${workplace?.name || 'the workplace'} was not approved.`,
        data: { type: 'JOIN_REJECTED', requestId: joinReq._id.toString(), workplaceId } }], { session });
      await AuditLogModel.create([{ workplaceId, actorId, action: 'JOIN_REQUEST_REJECTED', entityId: joinReq._id.toString(),
        metadata: { userId: joinReq.userId.toString(), reason: data?.reason } }], { session });
      return { message: 'Join request rejected', requestId: joinReq._id.toString() };
    });
  }

}

export const workplaceService = new WorkplaceService();
