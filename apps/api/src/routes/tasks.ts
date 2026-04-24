import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateTaskSchema, MatchVolunteersSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { matchVolunteersToTask } from '../services/matching';

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { status } = req.query as { status?: string };
    return db.task.findMany({
      where: status ? { status: status as any } : {},
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await db.task.findUnique({
      where: { id },
      include: {
        organization: true,
        applications: { include: { volunteer: true } },
      },
    });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });
    return task;
  });

  app.post('/', async (req, reply) => {
    const result = CreateTaskSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const correlationId = uuid();
    const task = await db.$transaction(async (tx) => {
      const t = await tx.task.create({ data: result.data });
      await tx.outboxEvent.create({
        data: {
          eventType: 'TaskCreated.v1',
          payload: {
            eventId: uuid(),
            eventType: 'TaskCreated.v1',
            occurredAt: new Date().toISOString(),
            producer: 'api',
            payload: {
              taskId: t.id,
              organizationId: t.organizationId,
              title: t.title,
              requiredSkills: t.requiredSkills,
              maxVolunteers: t.maxVolunteers,
            },
          },
        },
      });
      return t;
    });

    return reply.status(202).send({ correlationId, taskId: task.id });
  });

  // Opublikuj zadanie (DRAFT → OPEN)
  app.patch('/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await db.task.update({ where: { id }, data: { status: 'OPEN' } });
    return task;
  });

  // AI: dopasuj wolontariuszy do zadania
  app.post('/:id/match', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = MatchVolunteersSchema.safeParse({ taskId: id, ...(req.body as object) });
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const task = await db.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ error: 'Zadanie nie znalezione' });

    const volunteers = await db.volunteer.findMany({ where: { status: 'ACTIVE' } });
    if (volunteers.length === 0) return { taskId: id, matches: [] };

    const matches = await matchVolunteersToTask(task, volunteers, result.data.limit);
    return { taskId: id, matches };
  });
};
