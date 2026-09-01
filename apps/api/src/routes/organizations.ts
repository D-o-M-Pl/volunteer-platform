import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { CreateOrganizationSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { hasRole, requireRole } from '../security/auth';
import { hasOrganizationPermission } from '../security/scope';

const MemberSchema = z.object({
  identitySubject: z.string().trim().min(1).max(255),
  role: z.enum(['NGO_OWNER', 'NGO_MANAGER', 'NGO_RECRUITER', 'NGO_VIEWER']),
});
const UpdateMemberSchema = z.object({
  role: z.enum(['NGO_OWNER', 'NGO_MANAGER', 'NGO_RECRUITER', 'NGO_VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
}).refine((body) => body.role || body.status, 'role or status is required');

async function requireMemberAdmin(req: any, reply: any, organizationId: string) {
  if (await hasOrganizationPermission(req, organizationId, 'MANAGE_MEMBERS')) return true;
  reply.status(403).send({ error: 'forbidden' });
  return false;
}

export const organizationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => db.organization.findMany({
    select: { id: true, name: true, description: true, location: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }));

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const privateView = await hasOrganizationPermission(req, id, 'VIEW_PRIVATE');
    const org = await db.organization.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, location: true, createdAt: true,
        ...(privateView ? { contactEmail: true } : {}),
        tasks: { where: privateView ? {} : { status: 'OPEN' }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!org) return reply.status(404).send({ error: 'Organizacja nie znaleziona' });
    return org;
  });

  app.post('/', async (req, reply) => {
    if (!requireRole(req, reply, 'ORGANIZATION')) return;
    const result = CreateOrganizationSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: { ...result.data, ownerSubject: req.auth.subject } });
      await tx.organizationMembership.create({ data: { organizationId: created.id, identitySubject: req.auth.subject, role: 'NGO_OWNER' } });
      await tx.auditLog.create({ data: { organizationId: created.id, actorSubject: req.auth.subject, action: 'organization.created', targetType: 'organization', targetId: created.id } });
      return created;
    });
    return reply.status(202).send({ correlationId: uuid(), organizationId: org.id });
  });

  app.get('/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireMemberAdmin(req, reply, id))) return;
    return db.organizationMembership.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'asc' } });
  });

  app.post('/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireMemberAdmin(req, reply, id))) return;
    const parsed = MemberSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const member = await db.$transaction(async (tx) => {
      const created = await tx.organizationMembership.create({ data: { organizationId: id, ...parsed.data } });
      await tx.auditLog.create({ data: { organizationId: id, actorSubject: req.auth.subject, action: 'membership.created', targetType: 'identity', targetId: parsed.data.identitySubject, metadata: { role: parsed.data.role } } });
      return created;
    });
    return reply.status(201).send(member);
  });

  app.patch('/:id/members/:subject', async (req, reply) => {
    const { id, subject } = req.params as { id: string; subject: string };
    if (!(await requireMemberAdmin(req, reply, id))) return;
    const parsed = UpdateMemberSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const current = await db.organizationMembership.findUnique({ where: { organizationId_identitySubject: { organizationId: id, identitySubject: subject } } });
    if (!current) return reply.status(404).send({ error: 'membership_not_found' });
    const removesOwner = current.role === 'NGO_OWNER' && (parsed.data.role && parsed.data.role !== 'NGO_OWNER' || parsed.data.status === 'SUSPENDED');
    if (removesOwner) {
      const owners = await db.organizationMembership.count({ where: { organizationId: id, role: 'NGO_OWNER', status: 'ACTIVE' } });
      if (owners <= 1) return reply.status(409).send({ error: 'last_active_owner_required' });
    }
    const updated = await db.$transaction(async (tx) => {
      const member = await tx.organizationMembership.update({ where: { organizationId_identitySubject: { organizationId: id, identitySubject: subject } }, data: parsed.data });
      await tx.auditLog.create({ data: { organizationId: id, actorSubject: req.auth.subject, action: 'membership.updated', targetType: 'identity', targetId: subject, metadata: { before: { role: current.role, status: current.status }, after: parsed.data } } });
      return member;
    });
    return updated;
  });

  app.delete('/:id/members/:subject', async (req, reply) => {
    const { id, subject } = req.params as { id: string; subject: string };
    if (!(await requireMemberAdmin(req, reply, id))) return;
    const current = await db.organizationMembership.findUnique({ where: { organizationId_identitySubject: { organizationId: id, identitySubject: subject } } });
    if (!current) return reply.status(404).send({ error: 'membership_not_found' });
    if (current.role === 'NGO_OWNER' && current.status === 'ACTIVE') {
      const owners = await db.organizationMembership.count({ where: { organizationId: id, role: 'NGO_OWNER', status: 'ACTIVE' } });
      if (owners <= 1) return reply.status(409).send({ error: 'last_active_owner_required' });
    }
    await db.$transaction(async (tx) => {
      await tx.organizationMembership.delete({ where: { organizationId_identitySubject: { organizationId: id, identitySubject: subject } } });
      await tx.auditLog.create({ data: { organizationId: id, actorSubject: req.auth.subject, action: 'membership.deleted', targetType: 'identity', targetId: subject, metadata: { role: current.role, status: current.status } } });
    });
    return reply.status(204).send();
  });

  app.get('/:id/audit', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireMemberAdmin(req, reply, id)) && !hasRole(req, 'PLATFORM_ADMIN')) return;
    return db.auditLog.findMany({ where: { organizationId: id }, orderBy: { occurredAt: 'desc' }, take: 200 });
  });
};
