import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { volunteersRoutes } from './routes/volunteers';
import { organizationsRoutes } from './routes/organizations';
import { tasksRoutes } from './routes/tasks';
import { applicationsRoutes } from './routes/applications';
import { authenticate } from './security/auth';

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.CORS_ORIGINS || process.env.CORS_ORIGINS.includes('localhost'))) {
  throw new Error('Production CORS_ORIGINS must be explicit and must not contain localhost');
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 256 * 1024,
  trustProxy: process.env.TRUST_PROXY === 'true',
  requestIdHeader: 'x-request-id',
});

function allowedOrigins(): Set<string> {
  const configured = process.env.CORS_ORIGINS || 'http://localhost:3000';
  return new Set(configured.split(',').map((origin) => origin.trim()).filter(Boolean));
}

async function start() {
  const origins = allowedOrigins();
  await app.register(helmet);
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX) || 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.headers.authorization?.slice(-32) || request.ip,
  });
  await app.register(cors, {
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    origin(origin, callback) {
      callback(null, !origin || origins.has(origin));
    },
  });

  app.addHook('onRequest', authenticate);
  await app.register(volunteersRoutes, { prefix: '/api/volunteers' });
  await app.register(organizationsRoutes, { prefix: '/api/organizations' });
  await app.register(tasksRoutes, { prefix: '/api/tasks' });
  await app.register(applicationsRoutes, { prefix: '/api/applications' });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      const { db } = await import('./plugins/db');
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'not_ready' });
    }
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: process.env.HOST || '127.0.0.1' });
  app.log.info({ port }, 'API started');
}

start().catch((error) => {
  app.log.error(error, 'API startup failed');
  process.exit(1);
});
