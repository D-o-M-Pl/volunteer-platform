import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { volunteersRoutes } from './routes/volunteers';
import { organizationsRoutes } from './routes/organizations';
import { tasksRoutes } from './routes/tasks';
import { applicationsRoutes } from './routes/applications';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 1024 * 1024,
  trustProxy: process.env.TRUST_PROXY === 'true',
});

function allowedOrigins(): Set<string> {
  const configured = process.env.CORS_ORIGINS || 'http://localhost:3000';
  return new Set(configured.split(',').map((origin) => origin.trim()).filter(Boolean));
}

async function start() {
  const origins = allowedOrigins();

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: '1 minute',
  });
  await app.register(cors, {
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    origin(origin, callback) {
      if (!origin || origins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  await app.register(volunteersRoutes, { prefix: '/api/volunteers' });
  await app.register(organizationsRoutes, { prefix: '/api/organizations' });
  await app.register(tasksRoutes, { prefix: '/api/tasks' });
  await app.register(applicationsRoutes, { prefix: '/api/applications' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: process.env.HOST || '127.0.0.1' });
  app.log.info({ port }, 'API started');
}

start().catch((error) => {
  app.log.error(error, 'API startup failed');
  process.exit(1);
});
