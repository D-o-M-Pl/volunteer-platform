import Fastify from 'fastify';
import cors from '@fastify/cors';
import { volunteersRoutes } from './routes/volunteers';
import { organizationsRoutes } from './routes/organizations';
import { tasksRoutes } from './routes/tasks';
import { applicationsRoutes } from './routes/applications';

const app = Fastify({ logger: { level: 'info' } });

async function start() {
  await app.register(cors, { origin: true });

  await app.register(volunteersRoutes, { prefix: '/api/volunteers' });
  await app.register(organizationsRoutes, { prefix: '/api/organizations' });
  await app.register(tasksRoutes, { prefix: '/api/tasks' });
  await app.register(applicationsRoutes, { prefix: '/api/applications' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API uruchomione na http://localhost:${port}`);
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
