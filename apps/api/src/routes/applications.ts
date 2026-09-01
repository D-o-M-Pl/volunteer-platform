import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateApplicationSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { hasRole, requireRole } from '../security/auth';
import { canManageTask, ownVolunteer } from '../security/scope';

export const applicationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const { volunteerId, taskId } = req.query as { volunteerId?: string; taskId?: string };
    if (hasRole(req, 'ADMIN')) {
      return db.application.findMany({
        where: { ...(volunteerId ? { volunteerId } : {}), ...(taskId ? { taskId } : {}) },
        include: { volunteer: true, task: { include: { organization: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }
    const own = await ownVolunteer(req);
    if (hasRole(req, 'VOLUNTEER') && own) {
      if (volunteerId && volunteerId !== own.id) return reply.status(403).send({ error: 'forbidden' });
      return db.application.findMany({
        where: { volunteerId: own.id, ...(taskId ? { taskId } : {}) },
        include: { task: { include: { organization: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (hasRole(req, 'ORGANIZATION')) {
      return db.application.findMany({
        where: {
          ...(taskId ? { taskId } : {}),
          task: { organization: { ownerSubject: req.auth.subject } },
        },
        include: { volunteer: true, task: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    return reply.status(403).send({ error: 'forbidden' });
  });

  app.post('/', async (req, reply) => {
    if (!requireRole(req, reply, 'VOLUNTEER')) return;
    const parsed = CreateApplicationSchema.pick({ taskId: true }).safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const volunteer = await ownVolunteer(req);
    if (!volunteer) return reply.status(409).send({ error: 'volunteer_profile_required' });
    const task = await db.task.findFirst({ where: { id: parsed.data.taskId, status: 'OPEN' } });
    if (!task) return reply.status(404).send({ error: 'open_task_not_found' });
    const data = { volunteerId: volunteer.id, taskId: task.id };
    if (await db.application.findUnique({ where: { volunteerId_taskId: data } })) {
      return reply.status(409).send({ error: 'Już zgłoszony do tego zadania' });
    }
    const application = await db.$transaction(async (tx) => {
      const created = await tx.application.create({ data });
      await tx.outboxEvent.create({
        data: {
          eventType: 'ApplicationSubmitted.v1',
          payload: {
            eventId: uuid(), eventType: 'ApplicationSubmitted.v1',
            occurredAt: new Date().toISOString(), producer: 'api',
            payload: { applicationId: created.id, taskId: task.id },
          },
        },
      });
      return created;
    });
    return reply.status(202).send({ correlationId: uuid(), applicationId: application.id });
  });

  for (const [path, status] of [['/:id/accept', 'ACCEPTED'], ['/:id/reject', 'REJECTED']] as const) {
    app.patch(path, async (req, reply) => {
      const { id } = req.params as { id: string };
      const application = await db.application.findUnique({ where: { id } });
      if (!application) return reply.status(404).send({ error: 'application_not_found' });
      if (!(await canManageTask(req, application.taskId))) {
        return reply.status(403).send({ error: 'forbidden' });
      }
      return db.application.update({ where: { id }, data: { status } });
    });
  }
};
