import { z } from 'zod';

export const CreateVolunteerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  bio: z.string().optional(),
  skills: z.array(z.string()).default([]),
  location: z.string().optional(),
});

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  contactEmail: z.string().email(),
});

export const CreateTaskSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  requiredSkills: z.array(z.string()).default([]),
  location: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxVolunteers: z.number().int().positive().default(1),
});

export const CreateApplicationSchema = z.object({
  volunteerId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export const MatchVolunteersSchema = z.object({
  taskId: z.string().uuid(),
  limit: z.number().int().positive().max(20).default(5),
});

export type CreateVolunteerInput = z.infer<typeof CreateVolunteerSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type MatchVolunteersInput = z.infer<typeof MatchVolunteersSchema>;
