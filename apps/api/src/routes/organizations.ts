import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateOrganizationSchema } from '@volunteer/shared';
import { db } from '../plugins/db';

export const organizationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    return db.organization.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const org = await db.organization.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' } } },
    });
    if (!org) return reply.status(404).send({ error: 'Organizacja nie znaleziona' });
    return org;
  });

  app.post('/', async (req, reply) => {
    const result = CreateOrganizationSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const correlationId = uuid();
    const org = await db.organization.create({ data: result.data });

    return reply.status(202).send({ correlationId, organizationId: org.id });
  });
};
