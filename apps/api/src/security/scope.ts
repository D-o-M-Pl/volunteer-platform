import type { FastifyRequest } from 'fastify';
import type { OrganizationRole } from '@prisma/client';
import { db } from '../plugins/db';
import { hasRole } from './auth';

export type OrganizationPermission = 'VIEW_PRIVATE' | 'MANAGE_TASKS' | 'MANAGE_APPLICATIONS' | 'MANAGE_MEMBERS';

const permissions: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  NGO_OWNER: ['VIEW_PRIVATE', 'MANAGE_TASKS', 'MANAGE_APPLICATIONS', 'MANAGE_MEMBERS'],
  NGO_MANAGER: ['VIEW_PRIVATE', 'MANAGE_TASKS', 'MANAGE_APPLICATIONS'],
  NGO_RECRUITER: ['VIEW_PRIVATE', 'MANAGE_APPLICATIONS'],
  NGO_VIEWER: ['VIEW_PRIVATE'],
};

export async function ownVolunteer(request: FastifyRequest) {
  return db.volunteer.findUnique({ where: { identitySubject: request.auth.subject } });
}

export async function organizationMembership(request: FastifyRequest, organizationId: string) {
  if (hasRole(request, 'PLATFORM_ADMIN')) return { role: 'NGO_OWNER' as OrganizationRole };
  return db.organizationMembership.findFirst({
    where: { organizationId, identitySubject: request.auth.subject, status: 'ACTIVE' },
    select: { role: true },
  });
}

export async function hasOrganizationPermission(request: FastifyRequest, organizationId: string, permission: OrganizationPermission) {
  const membership = await organizationMembership(request, organizationId);
  return Boolean(membership && permissions[membership.role].includes(permission));
}

export async function canManageOrganization(request: FastifyRequest, organizationId: string) {
  return hasOrganizationPermission(request, organizationId, 'MANAGE_TASKS');
}

export async function canManageTask(request: FastifyRequest, taskId: string, permission: OrganizationPermission = 'MANAGE_TASKS') {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { organizationId: true } });
  return task ? hasOrganizationPermission(request, task.organizationId, permission) : false;
}

export function membershipOrganizationFilter(request: FastifyRequest) {
  if (hasRole(request, 'PLATFORM_ADMIN')) return {};
  return { memberships: { some: { identitySubject: request.auth.subject, status: 'ACTIVE' as const } } };
}
