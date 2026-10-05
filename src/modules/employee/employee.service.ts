import { Types } from 'mongoose';
import { WorkplaceMemberModel, IWorkplaceMember } from './workplace-member.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { TeamModel } from '../team/team.model';
import { teamService } from '../team/team.service';
import { formatWorkplaceCode } from '../workplace/workplace.service';
import { UserModel } from '../auth/user.model';
import { AuditLogModel } from '../audit/audit.model';
import { hashPin, generateSecureToken, hashToken } from '../../utils/crypto';
import { AppError } from '../../middleware/errorHandler';
import { emailService } from '../../services/email.service';
import { env } from '../../config/env';

export class EmployeeService {
  /**
   * List all employees in a workplace (active, invited, inactive) with team information
   */
  async getEmployees(workplaceId: string) {
    const employees = await WorkplaceMemberModel.find({
      workplaceId: new Types.ObjectId(workplaceId),
      role: 'EMPLOYEE',
    })
      .populate('userId', 'avatarUrl email')
      .populate('teamId', 'name color')
      .sort({ createdAt: -1 });

    return employees.map((emp: any) => ({
      id: emp._id.toString(),
      name: emp.name,
      employeeCode: emp.employeeCode,
      invitedEmail: emp.invitedEmail || emp.userId?.email || undefined,
      teamId: emp.teamId?._id?.toString() || (emp.teamId ? emp.teamId.toString() : undefined),
      teamName: emp.teamId?.name || undefined,
      status: emp.status,
      hasPin: Boolean(emp.pinHash),
      avatarUrl: emp.userId?.avatarUrl || undefined,
      joinedAt: emp.joinedAt,
      createdAt: emp.createdAt,
    }));
  }

  /**
   * Add a new employee to the workplace
   */
  async addEmployee(
    workplaceId: string,
    actorId: string,
    data: {
      name?: string;
      email?: string;
      employeeCode?: string;
      pin?: string;
      teamId?: string;
    }
  ) {
    const normEmail = data.email ? data.email.trim().toLowerCase() : undefined;
    const memberName = data.name?.trim() || (normEmail ? normEmail.split('@')[0] : 'Employee');

    // Check if email already added to this workplace
    if (normEmail) {
      const existing = await WorkplaceMemberModel.findOne({
        workplaceId: new Types.ObjectId(workplaceId),
        invitedEmail: normEmail,
      });
      if (existing) {
        throw new AppError('An employee with this email is already added to this workplace', 409, 'DUPLICATE_EMAIL');
      }
    }

    // Resolve or assign team (Hierarchy: Workplace -> Team -> Team Members)
    let assignedTeamId: Types.ObjectId;
    if (data.teamId) {
      const team = await TeamModel.findOne({
        _id: new Types.ObjectId(data.teamId),
        workplaceId: new Types.ObjectId(workplaceId),
      });
      if (!team) {
        throw new AppError('Selected team does not exist in this workplace', 404, 'TEAM_NOT_FOUND');
      }
      assignedTeamId = team._id;
    } else {
      const defaultTeam = await teamService.ensureDefaultTeam(workplaceId);
      assignedTeamId = defaultTeam._id;
    }

    // Generate or validate employee code
    let code = data.employeeCode ? data.employeeCode.trim().toUpperCase() : null;
    if (!code) {
      const count = await WorkplaceMemberModel.countDocuments({
        workplaceId: new Types.ObjectId(workplaceId),
      });
      code = `EMP-${1000 + count + 1}`;
    }

    // Hash PIN if supplied
    let pinHash: string | undefined;
    if (data.pin) {
      pinHash = await hashPin(data.pin);
    }

    const memberId = new Types.ObjectId();
    // Short 6 to 8 character invitation code with '-' in between:
    // e.g. 3 hex digits from workplaceId + '-' + 3 hex digits from new employee memberId (xxx-xxx: 6 code chars)
    const wpPart = workplaceId.slice(-3).toLowerCase();
    let empPart = memberId.toString().slice(-3).toLowerCase();
    let rawInviteToken = `${wpPart}-${empPart}`;

    // Ensure uniqueness for invitationCode across pending invited members; fallback to 4 chars (8 total) if conflict
    const codeConflict = await WorkplaceMemberModel.findOne({ invitationCode: rawInviteToken, status: 'INVITED' });
    if (codeConflict) {
      empPart = memberId.toString().slice(-4).toLowerCase();
      rawInviteToken = `${wpPart}-${empPart}`;
    }

    const invitationTokenHash = hashToken(rawInviteToken);
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // If user with this email already exists in system, link right away
    let existingUser = null;
    if (normEmail) {
      existingUser = await UserModel.findOne({ email: normEmail });
    }

    const member = await WorkplaceMemberModel.create({
      _id: memberId,
      workplaceId: new Types.ObjectId(workplaceId),
      userId: existingUser ? existingUser._id : undefined,
      teamId: assignedTeamId,
      role: 'EMPLOYEE',
      name: memberName,
      employeeCode: code,
      invitedEmail: normEmail,
      pinHash,
      status: 'INVITED',
      invitationCode: rawInviteToken,
      invitationTokenHash,
      invitationExpiresAt,
    });

    // Log audit event
    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'EMPLOYEE_CREATED',
      entityId: member._id.toString(),
      metadata: { employeeCode: code, email: normEmail, teamId: assignedTeamId.toString() },
    });

    // Generate workplace join link and dispatch invitation email if email is provided
    let joinLink: string | undefined;
    try {
      const workplace = await WorkplaceModel.findById(workplaceId);
      if (workplace) {
        const landing = new URL(env.WORKPLACE_JOIN_URL);
        landing.pathname = `${landing.pathname.replace(/\/$/, '')}/${encodeURIComponent(rawInviteToken)}`;
        landing.search = '';
        joinLink = landing.toString();

        if (normEmail) {
          const actor = await UserModel.findById(actorId);
          const adminName = actor?.name || 'Workplace Admin';
          const workplaceCode = formatWorkplaceCode(workplace);

          await emailService.sendWorkplaceInvitationEmail({
            toEmail: normEmail,
            employeeName: member.name,
            workplaceName: workplace.name,
            workplaceCode,
            adminName,
            address: workplace.address,
            joinLink,
          });
        }
      }
    } catch (emailErr) {
      console.error('[EmployeeService] Failed to send invitation email:', emailErr);
    }

    return {
      employee: {
        id: member._id.toString(),
        name: member.name,
        employeeCode: member.employeeCode,
        invitedEmail: member.invitedEmail,
        status: member.status,
        hasPin: Boolean(member.pinHash),
      },
      inviteToken: rawInviteToken,
      joinLink,
    };
  }

  /**
   * Update employee details or deactivate/activate
   */
  async updateEmployee(
    workplaceId: string,
    memberId: string,
    actorId: string,
    data: { name?: string; employeeCode?: string; status?: 'ACTIVE' | 'INACTIVE'; teamId?: string }
  ) {
    const member = await WorkplaceMemberModel.findOne({
      _id: new Types.ObjectId(memberId),
      workplaceId: new Types.ObjectId(workplaceId),
      role: 'EMPLOYEE',
    });

    if (!member) {
      throw new AppError('Employee not found in this workplace', 404, 'EMPLOYEE_NOT_FOUND');
    }

    if (data.name) member.name = data.name.trim();
    if (data.employeeCode) member.employeeCode = data.employeeCode.trim().toUpperCase();
    if (data.teamId) {
      const team = await TeamModel.findOne({
        _id: new Types.ObjectId(data.teamId),
        workplaceId: new Types.ObjectId(workplaceId),
      });
      if (!team) {
        throw new AppError('Selected team does not exist in this workplace', 404, 'TEAM_NOT_FOUND');
      }
      member.teamId = team._id;
    }

    if (data.status && data.status !== member.status) {
      member.status = data.status;
      await AuditLogModel.create({
        workplaceId: new Types.ObjectId(workplaceId),
        actorId: new Types.ObjectId(actorId),
        action: data.status === 'INACTIVE' ? 'EMPLOYEE_DISABLED' : 'EMPLOYEE_ACTIVATED',
        entityId: member._id.toString(),
      });
    }

    await member.save();
    return member;
  }

  /**
   * Reset employee PIN
   */
  async resetPin(workplaceId: string, memberId: string, actorId: string, newPin: string) {
    const member = await WorkplaceMemberModel.findOne({
      _id: new Types.ObjectId(memberId),
      workplaceId: new Types.ObjectId(workplaceId),
    });

    if (!member) {
      throw new AppError('Employee not found', 404, 'EMPLOYEE_NOT_FOUND');
    }

    member.pinHash = await hashPin(newPin);
    await member.save();

    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'ATTENDANCE_MODIFIED',
      entityId: member._id.toString(),
      metadata: { reason: 'PIN_RESET' },
    });

    return { message: 'PIN reset successfully' };
  }

  /**
   * Claim an invitation token or accept preapproved workplace invite
   */
  async claimInvitation(userId: string, options: { invitationToken?: string; workplaceId?: string }) {
    const user = await UserModel.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 404, 'USER_NOT_FOUND');
    }

    let member: IWorkplaceMember | null = null;

    if (options.invitationToken) {
      let cleanToken = options.invitationToken.trim().replace(/^["']|["']$/g, '');
      try {
        const u = new URL(cleanToken.replace(/^bizora:\/\//, 'http://dummy/'));
        const m = u.pathname.match(/\/join\/([^/?#]+)/) || u.pathname.match(/\/([^/?#]+)$/);
        if (m && m[1] !== 'dummy') cleanToken = decodeURIComponent(m[1]);
      } catch {
        const match = cleanToken.match(/\/join\/([^/?#]+)/);
        if (match) cleanToken = decodeURIComponent(match[1]);
      }
      const tokenHash = hashToken(cleanToken.toLowerCase());
      member = await WorkplaceMemberModel.findOne({
        $or: [
          { invitationCode: cleanToken.toLowerCase() },
          { invitationTokenHash: tokenHash },
          { invitationTokenHash: hashToken(cleanToken) },
        ],
        invitationExpiresAt: { $gt: new Date() },
      });

      if (!member) {
        const parts = cleanToken.split('-');
        if (parts.length === 2) {
          const [wpPart, empPart] = parts;
          member = await WorkplaceMemberModel.findOne({
            $and: [
              {
                $expr: {
                  $and: [
                    { $regexMatch: { input: { $toString: '$_id' }, regex: `${empPart}$`, options: 'i' } },
                    { $regexMatch: { input: { $toString: '$workplaceId' }, regex: `${wpPart}$`, options: 'i' } },
                  ],
                },
              },
              {
                $or: [
                  { invitationExpiresAt: { $gt: new Date() } },
                  { invitationExpiresAt: { $exists: false } },
                ],
              },
            ],
          });
        } else if (parts.length >= 3 && Types.ObjectId.isValid(parts[0]) && Types.ObjectId.isValid(parts[1])) {
          member = await WorkplaceMemberModel.findOne({
            _id: new Types.ObjectId(parts[1]),
            workplaceId: new Types.ObjectId(parts[0]),
            $or: [
              { invitationExpiresAt: { $gt: new Date() } },
              { invitationExpiresAt: { $exists: false } },
            ],
          });
        }
      }

      if (!member) {
        throw new AppError('Invalid or expired invitation link', 400, 'INVALID_INVITE_TOKEN');
      }

      // If invite had an invitedEmail, ensure current user's email matches
      if (member.invitedEmail && user.email && member.invitedEmail !== user.email.toLowerCase()) {
        throw new AppError(
          `This invitation was sent to ${member.invitedEmail}. Please sign in with that Google account.`,
          403,
          'EMAIL_MISMATCH'
        );
      }
    } else if (options.workplaceId) {
      member = await WorkplaceMemberModel.findOne({
        workplaceId: new Types.ObjectId(options.workplaceId),
        $or: [
          ...(user.email ? [{ invitedEmail: user.email.toLowerCase() }] : []),
          { userId: user._id },
        ],
        status: 'INVITED',
      });

      if (!member) {
        throw new AppError('No pending invitation found for your email at this workplace', 404, 'INVITE_NOT_FOUND');
      }
    } else {
      throw new AppError('Invitation token or workplace ID is required', 400, 'BAD_REQUEST');
    }

    // Activate membership and bind user ID
    member.userId = user._id;
    member.status = 'ACTIVE';
    member.joinedAt = new Date();
    member.invitationCode = undefined;
    member.invitationTokenHash = undefined;
    await member.save();

    await AuditLogModel.create({
      workplaceId: member.workplaceId,
      actorId: user._id,
      action: 'INVITATION_CLAIMED',
      entityId: member._id.toString(),
    });

    return {
      message: 'Workplace joined successfully',
      workplaceId: member.workplaceId.toString(),
      role: member.role,
      name: member.name,
    };
  }
}

export const employeeService = new EmployeeService();
