import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { CreateOrganizationSchema } from '@volunteer/shared';
import { db } from '../plugins/db';
import { hasRole, requireRole } from '../security/auth';
import { canManageOrganization } from '../security/scope';

export const organizationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => db.organization.findMany({
    select: { id: true, name: true, description: true, location: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }));

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const manager = await canManageOrganization(req, id);
    const org = await db.organization.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, location: true, createdAt: true,
        ...(manager ? { contactEmail: true } : {}),
        tasks: {
          where: manager ? {} : { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!org) return reply.status(404).send({ error: 'Organizacja nie znaleziona' });
    return org;
  });

  app.post('/', async (req, reply) => {
    if (!requireRole(req, reply, 'ORGANIZATION')) return;
    const result = CreateOrganizationSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });
    const existing = await db.organization.count({ where: { ownerSubject: req.auth.subject } });
    if (existing) return reply.status(409).send({ error: 'organization_already_exists' });
    const org = await db.organization.create({
      data: { ...result.data, ownerSubject: req.auth.subject },
    });
    return reply.status(202).send({ correlationId: uuid(), organizationId: org.id });
  });
};
