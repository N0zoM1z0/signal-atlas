import Fastify, { type FastifyInstance } from 'fastify';

export interface HealthResponse {
  status: 'ok';
  service: 'signal-atlas-orchestrator';
  mode: 'fixture';
  version: string;
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env['NODE_ENV'] !== 'test',
  });

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
    service: 'signal-atlas-orchestrator',
    mode: 'fixture',
    version: '0.0.0',
  }));

  return app;
}
