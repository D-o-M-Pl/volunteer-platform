import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateTaskSchema, MatchVolunteersSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { matchVolunteersToTask } from '../services/matching';
import { hasRole, requireRole } from '../security/auth';
import { canManageOrganization, canManageTask } from '../security/scope';

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { status } = req.query as { status?: string };
    const privileged = hasRole(req, 'ADMIN', 'ORGANIZATION');
    return db.task.findMany({
      where: {
        ...(privileged && status ? { status: status as any } : privileged ? {} : { status: 'OPEN' as const }),
        ...(hasRole(req, 'ORGANIZATION') && !hasRole(req, 'ADMIN')
          ? { organization: { ownerSubject: req.auth.subject } } : {}),
      },
      include: { organization: { select: { id: true, name: true, location: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const manager = await canManageTask(req, id);
    const task = await db.task.findFirst({
      where: { id, ...(manager ? {} : { status: 'OPEN' }) },
      include: {
        organization: { select: { id: true, name: true, location: true } },
        ...(manager ? { applications: { include: { volunteer: true } } } : {}),
      },
    });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });
    return task;
  });

  app.post('/', async (req, reply) => {
    if (!requireRole(req, reply, 'ADMIN', 'ORGANIZATION')) return;
    const result = CreateTaskSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    if (!(await canManageOrganization(req, result.data.organizationId))) {
      return reply.status(403).send({ error: 'forbidden' });
    }
    const task = await db.$transaction(async (tx) => {
      const t = await tx.task.create({ data: result.data });
      await tx.outboxEvent.create({
        data: {
          eventType: 'TaskCreated.v1',
          payload: {
            eventId: uuid(), eventType: 'TaskCreated.v1',
            occurredAt: new Date().toISOString(), producer: 'api',
            payload: { taskId: t.id, organizationId: t.organizationId },
          },
        },
      });
      return t;
    });
    return reply.status(202).send({ correlationId: uuid(), taskId: task.id });
  });

  app.patch('/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canManageTask(req, id))) return reply.status(403).send({ error: 'forbidden' });
    return db.task.update({ where: { id }, data: { status: 'OPEN' } });
  });

  app.post('/:id/match', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canManageTask(req, id))) return reply.status(403).send({ error: 'forbidden' });
    const result = MatchVolunteersSchema.safeParse({ taskId: id, ...(req.body as object) });
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    const task = await db.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });
    const volunteers = await db.volunteer.findMany({ where: { status: 'ACTIVE' } });
    return { taskId: id, matches: await matchVolunteersToTask(task, volunteers, result.data.limit) };
  });
};
