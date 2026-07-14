import Fastify, { type FastifyInstance } from 'fastify';

import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

import { ExpeditionRuntime } from './expedition-runtime.js';
import { interpretFixtureMission } from './fixture-mission-interpreter.js';

export interface HealthResponse {
  status: 'ok';
  service: 'signal-atlas-orchestrator';
  mode: 'fixture';
  version: string;
}

export interface BuildAppOptions {
  runtime?: ExpeditionRuntime;
  runScheduler?: boolean;
}

interface ExpeditionParams {
  id: string;
}

interface EventsQuery {
  after?: string;
}

interface InterpretMissionBody {
  text?: unknown;
  selectedAgentId?: unknown;
}

function statusForRejectedCommand(issues: readonly { code: string }[]): number {
  return issues.some((issue) => issue.code === 'idempotency_conflict') ? 409 : 422;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger:
      process.env['NODE_ENV'] === 'test' ? false : { level: process.env['LOG_LEVEL'] ?? 'warn' },
  });
  const runtime = options.runtime ?? new ExpeditionRuntime(createHelios3ExpeditionFixture());
  const runScheduler = options.runScheduler ?? process.env['NODE_ENV'] !== 'test';
  let scheduler: ReturnType<typeof setInterval> | undefined;
  if (runScheduler) {
    let previousTick = Date.now();
    scheduler = setInterval(() => {
      const currentTick = Date.now();
      runtime.advance(currentTick - previousTick, new Date(currentTick).toISOString());
      previousTick = currentTick;
    }, 100);
    scheduler.unref();
  }
  app.addHook('onClose', async () => {
    if (scheduler) clearInterval(scheduler);
  });

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
    service: 'signal-atlas-orchestrator',
    mode: 'fixture',
    version: '0.0.0',
  }));

  app.get<{ Params: ExpeditionParams }>('/api/expeditions/:id/snapshot', async (request, reply) => {
    if (request.params.id !== runtime.expeditionId) {
      return reply.code(404).send({ error: 'expedition_not_found' });
    }
    return { projection: runtime.snapshot() };
  });

  app.get<{ Params: ExpeditionParams; Querystring: EventsQuery }>(
    '/api/expeditions/:id/events',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      const after = Number(request.query.after ?? 0);
      if (!Number.isInteger(after) || after < 0) {
        return reply.code(400).send({ error: 'invalid_sequence' });
      }
      return { events: runtime.eventsAfter(after), sequence: runtime.snapshot().sequence };
    },
  );

  app.post<{ Params: ExpeditionParams; Body: InterpretMissionBody }>(
    '/api/expeditions/:id/mission-drafts/interpret',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      if (typeof request.body?.text !== 'string' || request.body.text.trim().length === 0) {
        return reply.code(400).send({ error: 'mission_text_required' });
      }
      if (
        request.body.selectedAgentId !== undefined &&
        typeof request.body.selectedAgentId !== 'string'
      ) {
        return reply.code(400).send({ error: 'selected_agent_id_must_be_a_string' });
      }
      return {
        draft: interpretFixtureMission(
          request.body.text,
          runtime.snapshot(),
          request.body.selectedAgentId,
        ),
      };
    },
  );

  app.post<{ Params: ExpeditionParams; Body: unknown }>(
    '/api/expeditions/:id/commands',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      const result = runtime.submit(request.body);
      if (!result.accepted) {
        return reply.code(statusForRejectedCommand(result.issues)).send(result);
      }
      return reply.code(result.duplicate ? 200 : 202).send(result);
    },
  );

  if (process.env['SIGNAL_ATLAS_E2E'] === '1') {
    app.post('/api/testing/reset', async () => {
      runtime.resetToFixture();
      return { reset: true, sequence: runtime.snapshot().sequence };
    });
  }

  return app;
}
