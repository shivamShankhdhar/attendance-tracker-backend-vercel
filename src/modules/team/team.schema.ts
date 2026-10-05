import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(60, 'Team name cannot exceed 60 characters'),
  description: z.string().max(300).optional(),
  color: z.string().max(20).optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const assignTeamMemberSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
});
