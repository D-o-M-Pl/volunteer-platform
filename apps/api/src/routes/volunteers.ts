import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateVolunteerSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { hasRole, requireRole } from '../security/auth';
import { ownVolunteer } from '../security/scope';

export const volunteersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    if (!requireRole(req, reply, 'PLATFORM_ADMIN')) return;
    return db.volunteer.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const own = await ownVolunteer(req);
    if (!hasRole(req, 'PLATFORM_ADMIN') && own?.id !== id) return reply.status(403).send({ error: 'forbidden' });
    const volunteer = await db.volunteer.findUnique({
      where: { id },
      include: { applications: { include: { task: { include: { organization: true } } } } },
    });
    if (!volunteer) return reply.status(404).send({ error: 'Wolontariusz nie znaleziony' });
    return volunteer;
  });

  app.post('/', async (req, reply) => {
    if (!requireRole(req, reply, 'VOLUNTEER')) return;
    const result = CreateVolunteerSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    const existing = await ownVolunteer(req);
    if (existing) return reply.status(409).send({ error: 'profile_already_exists' });

    const correlationId = uuid();
    const volunteer = await db.$transaction(async (tx) => {
      const v = await tx.volunteer.create({
        data: { ...result.data, identitySubject: req.auth.subject },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'VolunteerRegistered.v1',
          payload: {
            eventId: uuid(), eventType: 'VolunteerRegistered.v1',
            occurredAt: new Date().toISOString(), producer: 'api',
            payload: { volunteerId: v.id, skills: v.skills },
          },
        },
      });
      return v;
    });
    return reply.status(202).send({ correlationId, volunteerId: volunteer.id });
  });

  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const own = await ownVolunteer(req);
    if (!hasRole(req, 'PLATFORM_ADMIN') && own?.id !== id) return reply.status(403).send({ error: 'forbidden' });
    const { status } = req.body as { status?: string };
    const allowed = hasRole(req, 'PLATFORM_ADMIN') ? ['ACTIVE', 'INACTIVE', 'PENDING'] : ['INACTIVE'];
    if (!status || !allowed.includes(status)) return reply.status(400).send({ error: 'Nieprawidłowy status' });
    return db.volunteer.update({ where: { id }, data: { status: status as any } });
  });
};
