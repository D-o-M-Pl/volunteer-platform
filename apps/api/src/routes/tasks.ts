import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateTaskSchema, MatchVolunteersSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { matchVolunteersToTask } from '../services/matching';
import { hasRole } from '../security/auth';
import { canManageOrganization, canManageTask } from '../security/scope';

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { status, organizationId } = req.query as { status?: string; organizationId?: string };
    const memberships = hasRole(req, 'PLATFORM_ADMIN') ? undefined : await db.organizationMembership.findMany({ where: { identitySubject: req.auth.subject, status: 'ACTIVE' }, select: { organizationId: true } });
    const memberOrganizationIds = memberships?.map((m) => m.organizationId) ?? [];
    const privateScope = organizationId && (hasRole(req, 'PLATFORM_ADMIN') || memberOrganizationIds.includes(organizationId));
    return db.task.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(privateScope ? (status ? { status: status as any } : {}) : { status: 'OPEN' as const }),
      },
      include: { organization: { select: { id: true, name: true, location: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const manager = await canManageTask(req, id, 'VIEW_PRIVATE');
    const task = await db.task.findFirst({ where: { id, ...(manager ? {} : { status: 'OPEN' }) }, include: { organization: { select: { id: true, name: true, location: true } }, ...(manager ? { applications: { include: { volunteer: true } } } : {}) } });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });
    return task;
  });

  app.post('/', async (req, reply) => {
    const result = CreateTaskSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    if (!(await canManageOrganization(req, result.data.organizationId))) return reply.status(403).send({ error: 'forbidden' });
    const task = await db.$transaction(async (tx) => {
      const created = await tx.task.create({ data: result.data });
      await tx.auditLog.create({ data: { organizationId: created.organizationId, actorSubject: req.auth.subject, action: 'task.created', targetType: 'task', targetId: created.id } });
      await tx.outboxEvent.create({ data: { eventType: 'TaskCreated.v1', payload: { eventId: uuid(), eventType: 'TaskCreated.v1', occurredAt: new Date().toISOString(), producer: 'api', payload: { taskId: created.id, organizationId: created.organizationId } } } });
      return created;
    });
    return reply.status(202).send({ correlationId: uuid(), taskId: task.id });
  });

  app.patch('/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canManageTask(req, id))) return reply.status(403).send({ error: 'forbidden' });
    const current = await db.task.findUnique({ where: { id }, select: { organizationId: true } });
    if (!current) return reply.status(404).send({ error: 'task_not_found' });
    return db.$transaction(async (tx) => {
      const task = await tx.task.update({ where: { id }, data: { status: 'OPEN' } });
      await tx.auditLog.create({ data: { organizationId: current.organizationId, actorSubject: req.auth.subject, action: 'task.published', targetType: 'task', targetId: id } });
      return task;
    });
  });

  app.post('/:id/match', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canManageTask(req, id, 'MANAGE_APPLICATIONS'))) return reply.status(403).send({ error: 'forbidden' });
    const result = MatchVolunteersSchema.safeParse({ taskId: id, ...(req.body as object) });
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    const task = await db.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });
    const volunteers = await db.volunteer.findMany({ where: { status: 'ACTIVE' } });
    return { taskId: id, matches: await matchVolunteersToTask(task, volunteers, result.data.limit) };
  });
};
