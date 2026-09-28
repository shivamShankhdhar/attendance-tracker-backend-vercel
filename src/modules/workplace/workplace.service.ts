import { Types } from 'mongoose';
import { WorkplaceModel } from './workplace.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { UserModel } from '../auth/user.model';
import { AppError } from '../../middleware/errorHandler';

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
}

export const workplaceService = new WorkplaceService();
