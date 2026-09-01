import type { FastifyRequest } from 'fastify';
import { db } from '../plugins/db';
import { hasRole } from './auth';

export async function ownVolunteer(request: FastifyRequest) {
  return db.volunteer.findUnique({ where: { identitySubject: request.auth.subject } });
}

export async function canManageOrganization(request: FastifyRequest, organizationId: string) {
  if (hasRole(request, 'ADMIN')) return true;
  if (!hasRole(request, 'ORGANIZATION')) return false;
  const count = await db.organization.count({
    where: { id: organizationId, ownerSubject: request.auth.subject },
  });
  return count === 1;
}

export async function canManageTask(request: FastifyRequest, taskId: string) {
  if (hasRole(request, 'ADMIN')) return true;
  if (!hasRole(request, 'ORGANIZATION')) return false;
  const count = await db.task.count({
    where: { id: taskId, organization: { ownerSubject: request.auth.subject } },
  });
  return count === 1;
}
