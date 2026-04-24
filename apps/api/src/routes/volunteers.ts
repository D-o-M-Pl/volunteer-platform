import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateVolunteerSchema } from '@volunteer/shared';
import { db } from '../plugins/db';

export const volunteersRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/volunteers
  app.get('/', async () => {
    return db.volunteer.findMany({ orderBy: { createdAt: 'desc' } });
  });

  // GET /api/volunteers/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const volunteer = await db.volunteer.findUnique({
      where: { id },
      include: { applications: { include: { task: { include: { organization: true } } } } },
    });
    if (!volunteer) return reply.status(404).send({ error: 'Wolontariusz nie znaleziony' });
    return volunteer;
  });

  // POST /api/volunteers — rejestracja (asynchroniczna, 202 Accepted)
  app.post('/', async (req, reply) => {
    const result = CreateVolunteerSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const correlationId = uuid();
    const volunteer = await db.$transaction(async (tx) => {
      const v = await tx.volunteer.create({ data: result.data });
      await tx.outboxEvent.create({
        data: {
          eventType: 'VolunteerRegistered.v1',
          payload: {
            eventId: uuid(),
            eventType: 'VolunteerRegistered.v1',
            occurredAt: new Date().toISOString(),
            producer: 'api',
            payload: { volunteerId: v.id, email: v.email, name: v.name, skills: v.skills },
          },
        },
      });
      return v;
    });

    return reply.status(202).send({ correlationId, volunteerId: volunteer.id });
  });

  // PATCH /api/volunteers/:id/status
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const allowed = ['ACTIVE', 'INACTIVE', 'PENDING'];
    if (!allowed.includes(status)) return reply.status(400).send({ error: 'Nieprawidłowy status' });

    const volunteer = await db.volunteer.update({ where: { id }, data: { status: status as any } });
    return volunteer;
  });
};
