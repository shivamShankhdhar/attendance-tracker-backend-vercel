import { Types } from 'mongoose';
import { WorkplaceMemberModel, IWorkplaceMember } from './workplace-member.model';
import { UserModel } from '../auth/user.model';
import { AuditLogModel } from '../audit/audit.model';
import { hashPin, generateSecureToken, hashToken } from '../../utils/crypto';
import { AppError } from '../../middleware/errorHandler';

export class EmployeeService {
  /**
   * List all employees in a workplace (active, invited, inactive)
   */
  async getEmployees(workplaceId: string) {
    const employees = await WorkplaceMemberModel.find({
      workplaceId: new Types.ObjectId(workplaceId),
      role: 'EMPLOYEE',
    }).sort({ createdAt: -1 });

    return employees.map((emp) => ({
      id: emp._id.toString(),
      name: emp.name,
      employeeCode: emp.employeeCode,
      invitedEmail: emp.invitedEmail,
      status: emp.status,
      hasPin: Boolean(emp.pinHash),
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
      name: string;
      email?: string;
      employeeCode?: string;
      pin?: string;
    }
  ) {
    const normEmail = data.email ? data.email.trim().toLowerCase() : undefined;

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

    // Generate one-time invitation token
    const rawInviteToken = generateSecureToken(24);
    const invitationTokenHash = hashToken(rawInviteToken);
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // If user with this email already exists in system, link right away
    let existingUser = null;
    if (normEmail) {
      existingUser = await UserModel.findOne({ email: normEmail });
    }

    const member = await WorkplaceMemberModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      userId: existingUser ? existingUser._id : undefined,
      role: 'EMPLOYEE',
      name: data.name.trim(),
      employeeCode: code,
      invitedEmail: normEmail,
      pinHash,
      status: 'INVITED',
      invitationTokenHash,
      invitationExpiresAt,
    });

    // Log audit event
    await AuditLogModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      actorId: new Types.ObjectId(actorId),
      action: 'EMPLOYEE_CREATED',
      entityId: member._id.toString(),
      metadata: { employeeCode: code, email: normEmail },
    });

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
    };
  }

  /**
   * Update employee details or deactivate/activate
   */
  async updateEmployee(
    workplaceId: string,
    memberId: string,
    actorId: string,
    data: { name?: string; employeeCode?: string; status?: 'ACTIVE' | 'INACTIVE' }
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
      const tokenHash = hashToken(options.invitationToken.trim());
      member = await WorkplaceMemberModel.findOne({
        invitationTokenHash: tokenHash,
        invitationExpiresAt: { $gt: new Date() },
      });

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
    } else if (options.workplaceId && user.email) {
      member = await WorkplaceMemberModel.findOne({
        workplaceId: new Types.ObjectId(options.workplaceId),
        invitedEmail: user.email.toLowerCase(),
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
