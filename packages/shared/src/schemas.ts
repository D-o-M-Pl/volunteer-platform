import { z } from 'zod';

const shortText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(2000).optional();
const skill = z.string().trim().min(1).max(80);

export const CreateVolunteerSchema = z.object({
  name: shortText,
  email: z.string().trim().email().max(320),
  bio: optionalText,
  skills: z.array(skill).max(50).default([]),
  location: z.string().trim().max(200).optional(),
}).strict();

export const CreateOrganizationSchema = z.object({
  name: shortText,
  description: optionalText,
  location: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320),
}).strict();

export const CreateTaskSchema = z.object({
  organizationId: z.string().uuid(),
  title: shortText,
  description: z.string().trim().min(1).max(5000),
  requiredSkills: z.array(skill).max(50).default([]),
  location: z.string().trim().max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxVolunteers: z.number().int().positive().max(10000).default(1),
}).strict();

export const CreateApplicationSchema = z.object({
  volunteerId: z.string().uuid(),
  taskId: z.string().uuid(),
}).strict();

export const MatchVolunteersSchema = z.object({
  taskId: z.string().uuid(),
  limit: z.number().int().positive().max(20).default(5),
}).strict();

export type CreateVolunteerInput = z.infer<typeof CreateVolunteerSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type MatchVolunteersInput = z.infer<typeof MatchVolunteersSchema>;
