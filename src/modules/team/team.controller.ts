import { Request, Response, NextFunction } from 'express';
import { teamService } from './team.service';

export class TeamController {
  async getTeams(req: Request, res: Response, next: NextFunction) {
    try {
      const workplaceId = req.params.workplaceId as string;
      const teams = await teamService.getTeams(workplaceId);
      res.status(200).json({ success: true, data: teams });
    } catch (err) {
      next(err);
    }
  }

  async createTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const workplaceId = req.params.workplaceId as string;
      const team = await teamService.createTeam(workplaceId, req.user!.userId, req.body);
      res.status(201).json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  }

  async updateTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { workplaceId, teamId } = req.params as { workplaceId: string; teamId: string };
      const team = await teamService.updateTeam(workplaceId, teamId, req.body);
      res.status(200).json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  }

  async deleteTeam(req: Request, res: Response, next: NextFunction) {
    try {
      const { workplaceId, teamId } = req.params as { workplaceId: string; teamId: string };
      const result = await teamService.deleteTeam(workplaceId, teamId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async assignMember(req: Request, res: Response, next: NextFunction) {
    try {
      const { workplaceId, teamId } = req.params as { workplaceId: string; teamId: string };
      const result = await teamService.assignMemberToTeam(workplaceId, teamId, req.body.memberId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const teamController = new TeamController();
