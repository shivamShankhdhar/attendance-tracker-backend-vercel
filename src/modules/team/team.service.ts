import crypto from 'crypto';
import { Types } from 'mongoose';
import { TeamModel, ITeam } from './team.model';
import { WorkplaceMemberModel } from '../employee/workplace-member.model';
import { WorkplaceModel } from '../workplace/workplace.model';
import { AppError } from '../../middleware/errorHandler';

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate cryptographically random unique team code strictly 7 to 8 characters (e.g. TM7K9P2X)
 */
export function generateTeamCode(): string {
  let result = 'TM';
  const randomBytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += CODE_CHARS[randomBytes[i] % CODE_CHARS.length];
  }
  return result; // Exactly 8 characters (e.g. TM8K4X2P)
}

/**
 * Format or derive a unique 7-8 character team code for backward-compatible existing teams
 */
export function formatTeamCode(team: { teamCode?: string; _id?: any }): string {
  if (team.teamCode && team.teamCode.length >= 7 && team.teamCode.length <= 8) {
    return team.teamCode.toUpperCase();
  }
  if (team.teamCode) {
    return team.teamCode.toUpperCase().slice(0, 8);
  }
  const idStr = team._id ? team._id.toString() : '';
  const hash = crypto.createHash('sha256').update(idStr).digest('hex').toUpperCase();
  let code = 'TM';
  for (let i = 0; i < 6; i++) {
    const byte = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    code += CODE_CHARS[byte % CODE_CHARS.length];
  }
  return code; // 8 characters
}

export class TeamService {
  /**
   * Ensure a default "General" team exists for a workplace
   */
  async ensureDefaultTeam(workplaceId: Types.ObjectId | string): Promise<ITeam> {
    const wpId = typeof workplaceId === 'string' ? new Types.ObjectId(workplaceId) : workplaceId;
    let defaultTeam = await TeamModel.findOne({ workplaceId: wpId, isDefault: true });
    if (!defaultTeam) {
      // Check if any team exists
      const anyTeam = await TeamModel.findOne({ workplaceId: wpId });
      if (anyTeam) {
        anyTeam.isDefault = true;
        if (!anyTeam.teamCode) {
          anyTeam.teamCode = formatTeamCode(anyTeam);
        }
        await anyTeam.save();
        return anyTeam;
      }

      let teamCode = generateTeamCode();
      for (let attempt = 0; attempt < 10; attempt++) {
        const conflict = await TeamModel.findOne({ teamCode });
        if (!conflict) break;
        teamCode = generateTeamCode();
      }

      defaultTeam = await TeamModel.create({
        workplaceId: wpId,
        name: 'General',
        description: 'Default workplace team',
        color: '#5B692D',
        isDefault: true,
        teamCode,
      });
    } else if (!defaultTeam.teamCode) {
      defaultTeam.teamCode = formatTeamCode(defaultTeam);
      await defaultTeam.save();
    }
    return defaultTeam;
  }

  /**
   * Create a new team in a workplace with unique 7-8 char teamCode
   */
  async createTeam(
    workplaceId: string,
    actorId: string,
    data: { name: string; description?: string; color?: string; teamCode?: string }
  ) {
    const wp = await WorkplaceModel.findById(workplaceId);
    if (!wp || wp.status !== 'ACTIVE') {
      throw new AppError('Workplace not found or inactive', 404, 'WORKPLACE_NOT_FOUND');
    }

    const trimmedName = data.name.trim();
    const existing = await TeamModel.findOne({
      workplaceId: new Types.ObjectId(workplaceId),
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
    });
    if (existing) {
      throw new AppError('A team with this name already exists in this workplace', 409, 'DUPLICATE_TEAM_NAME');
    }

    const count = await TeamModel.countDocuments({ workplaceId: new Types.ObjectId(workplaceId) });

    let teamCode = data.teamCode?.trim().toUpperCase() || generateTeamCode();
    // Validate teamCode length (7 to 8 chars)
    if (teamCode.length < 7 || teamCode.length > 8) {
      teamCode = generateTeamCode();
    }

    // Ensure uniqueness
    for (let attempt = 0; attempt < 10; attempt++) {
      const conflict = await TeamModel.findOne({ teamCode });
      if (!conflict) break;
      teamCode = generateTeamCode();
    }

    const team = await TeamModel.create({
      workplaceId: new Types.ObjectId(workplaceId),
      name: trimmedName,
      description: data.description?.trim(),
      color: data.color || '#5B692D',
      isDefault: count === 0,
      teamCode,
    });

    return {
      id: team._id.toString(),
      workplaceId: team.workplaceId.toString(),
      name: team.name,
      teamCode: team.teamCode,
      description: team.description,
      color: team.color,
      isDefault: team.isDefault,
      memberCount: 0,
      createdAt: team.createdAt,
    };
  }

  /**
   * List all teams in a workplace with member counts and member details
   */
  async getTeams(workplaceId: string) {
    const wpId = new Types.ObjectId(workplaceId);
    // Ensure default team exists
    await this.ensureDefaultTeam(wpId);

    const teams = await TeamModel.find({ workplaceId: wpId }).sort({ isDefault: -1, createdAt: 1 });
    const teamIds = teams.map((t) => t._id);

    const members = await WorkplaceMemberModel.find({
      workplaceId: wpId,
      status: { $in: ['ACTIVE', 'INVITED'] },
    }).populate('userId', 'avatarUrl email name');

    // Group members by teamId
    const teamMemberMap = new Map<string, any[]>();
    const unassignedMembers: any[] = [];

    for (const m of members) {
      const tId = m.teamId ? m.teamId.toString() : null;
      const memberDto = {
        id: m._id.toString(),
        name: m.name,
        employeeCode: m.employeeCode,
        role: m.role,
        status: m.status,
        avatarUrl: (m.userId as any)?.avatarUrl,
        email: (m.userId as any)?.email || m.invitedEmail,
      };

      if (tId) {
        if (!teamMemberMap.has(tId)) {
          teamMemberMap.set(tId, []);
        }
        teamMemberMap.get(tId)!.push(memberDto);
      } else {
        unassignedMembers.push(memberDto);
      }
    }

    return await Promise.all(
      teams.map(async (team) => {
        const tIdStr = team._id.toString();
        const teamMembers = teamMemberMap.get(tIdStr) || [];
        // If this is default team and there are unassigned members, attach them
        const fullMembers = team.isDefault ? [...teamMembers, ...unassignedMembers] : teamMembers;

        let code = team.teamCode;
        if (!code) {
          code = formatTeamCode(team);
          team.teamCode = code;
          await team.save().catch(() => {});
        }

        return {
          id: tIdStr,
          workplaceId: team.workplaceId.toString(),
          name: team.name,
          teamCode: code,
          description: team.description,
          color: team.color,
          isDefault: team.isDefault,
          memberCount: fullMembers.length,
          members: fullMembers,
          createdAt: team.createdAt,
        };
      })
    );
  }

  /**
   * Find team by unique teamCode (7-8 chars) or id
   */
  async getTeamByCode(code: string) {
    const cleanCode = code.trim().toUpperCase();
    let team = await TeamModel.findOne({ teamCode: cleanCode });
    if (!team && Types.ObjectId.isValid(code)) {
      team = await TeamModel.findById(code);
    }
    return team;
  }

  /**
   * Update team info
   */
  async updateTeam(
    workplaceId: string,
    teamId: string,
    data: { name?: string; description?: string; color?: string }
  ) {
    const team = await TeamModel.findOne({
      _id: new Types.ObjectId(teamId),
      workplaceId: new Types.ObjectId(workplaceId),
    });
    if (!team) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    if (data.name && data.name.trim() !== team.name) {
      const trimmed = data.name.trim();
      const existing = await TeamModel.findOne({
        workplaceId: new Types.ObjectId(workplaceId),
        _id: { $ne: team._id },
        name: { $regex: new RegExp(`^${trimmed}$`, 'i') },
      });
      if (existing) {
        throw new AppError('Another team already has this name', 409, 'DUPLICATE_TEAM_NAME');
      }
      team.name = trimmed;
    }

    if (data.description !== undefined) team.description = data.description?.trim();
    if (data.color !== undefined) team.color = data.color?.trim();

    await team.save();

    return {
      id: team._id.toString(),
      workplaceId: team.workplaceId.toString(),
      name: team.name,
      description: team.description,
      color: team.color,
      isDefault: team.isDefault,
      updatedAt: team.updatedAt,
    };
  }

  /**
   * Delete a team. Cannot delete default team if it's the only one.
   * Members of deleted team are moved to the default team.
   */
  async deleteTeam(workplaceId: string, teamId: string) {
    const team = await TeamModel.findOne({
      _id: new Types.ObjectId(teamId),
      workplaceId: new Types.ObjectId(workplaceId),
    });
    if (!team) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const totalTeams = await TeamModel.countDocuments({ workplaceId: new Types.ObjectId(workplaceId) });
    if (totalTeams <= 1) {
      throw new AppError('Cannot delete the only team in a workplace', 400, 'CANNOT_DELETE_LAST_TEAM');
    }

    const defaultTeam = await this.ensureDefaultTeam(workplaceId);

    // Reassign all members of this team to default team
    await WorkplaceMemberModel.updateMany(
      { workplaceId: new Types.ObjectId(workplaceId), teamId: team._id },
      { $set: { teamId: defaultTeam._id } }
    );

    await TeamModel.findByIdAndDelete(team._id);

    return { success: true, message: 'Team deleted and members moved to default team' };
  }

  /**
   * Assign a member to a team
   */
  async assignMemberToTeam(workplaceId: string, teamId: string, memberId: string) {
    const team = await TeamModel.findOne({
      _id: new Types.ObjectId(teamId),
      workplaceId: new Types.ObjectId(workplaceId),
    });
    if (!team) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const member = await WorkplaceMemberModel.findOne({
      _id: new Types.ObjectId(memberId),
      workplaceId: new Types.ObjectId(workplaceId),
    });
    if (!member) {
      throw new AppError('Member not found in this workplace', 404, 'MEMBER_NOT_FOUND');
    }

    member.teamId = team._id;
    await member.save();

    return {
      success: true,
      memberId: member._id.toString(),
      teamId: team._id.toString(),
      teamName: team.name,
    };
  }
}

export const teamService = new TeamService();
