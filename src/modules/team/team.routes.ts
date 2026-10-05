import { Router } from 'express';
import { teamController } from './team.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { authenticate } from '../../middleware/authenticate';
import { requireWorkplaceMember, requireWorkplaceRole } from '../../middleware/authorize';
import { createTeamSchema, updateTeamSchema, assignTeamMemberSchema } from './team.schema';

export const teamRouter: Router = Router({ mergeParams: true });

teamRouter.use(authenticate);

// List teams in workplace (Available to members)
teamRouter.get(
  '/:workplaceId/teams',
  requireWorkplaceMember(),
  teamController.getTeams
);

// Create new team (Employer only)
teamRouter.post(
  '/:workplaceId/teams',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: createTeamSchema }),
  teamController.createTeam
);

// Update team details (Employer only)
teamRouter.put(
  '/:workplaceId/teams/:teamId',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: updateTeamSchema }),
  teamController.updateTeam
);

// Delete team (Employer only)
teamRouter.delete(
  '/:workplaceId/teams/:teamId',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  teamController.deleteTeam
);

// Assign a member to team (Employer only)
teamRouter.post(
  '/:workplaceId/teams/:teamId/members',
  requireWorkplaceMember(),
  requireWorkplaceRole(['EMPLOYER']),
  validateRequest({ body: assignTeamMemberSchema }),
  teamController.assignMember
);
