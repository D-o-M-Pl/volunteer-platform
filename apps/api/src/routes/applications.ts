import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateApplicationSchema } from '@volunteer/shared';
import { db } from '../plugins/db';

export const applicationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const { volunteerId, taskId } = req.query as { volunteerId?: string; taskId?: string };
    return db.application.findMany({
      where: {
        ...(volunteerId ? { volunteerId } : {}),
        ...(taskId ? { taskId } : {}),
      },
      include: {
        volunteer: true,
        task: { include: { organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // POST /api/applications — zgłoszenie wolontariusza (202 Accepted)
  app.post('/', async (req, reply) => {
    const result = CreateApplicationSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const existing = await db.application.findUnique({
      where: { volunteerId_taskId: result.data },
    });
    if (existing) return reply.status(409).send({ error: 'Już zgłoszony do tego zadania' });

    const correlationId = uuid();
    const application = await db.$transaction(async (tx) => {
      const a = await tx.application.create({ data: result.data });
      await tx.outboxEvent.create({
        data: {
          eventType: 'ApplicationSubmitted.v1',
          payload: {
            eventId: uuid(),
            eventType: 'ApplicationSubmitted.v1',
            occurredAt: new Date().toISOString(),
            producer: 'api',
            payload: { applicationId: a.id, ...result.data },
          },
        },
      });
      return a;
    });

    return reply.status(202).send({ correlationId, applicationId: application.id });
  });

  app.patch('/:id/accept', async (req, reply) => {
    const { id } = req.params as { id: string };
    const application = await db.application.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
    return application;
  });

  app.patch('/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const application = await db.application.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    return application;
  });
};
