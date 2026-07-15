import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';

import {
  parseEventStreamEnvelope,
  SCHEMA_VERSION,
  type EventStreamEnvelope,
  type WorldEvent,
} from '@signal-atlas/contracts';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

import {
  ExpeditionRuntime,
  FixtureResolutionConflictError,
  ReplaySequenceError,
} from './expedition-runtime.js';
import { fixtureMissionScenarios, type FixtureMissionScenario } from './fixture-mission-driver.js';
import { interpretFixtureMission } from './fixture-mission-interpreter.js';
import {
  createConfiguredMissionDriver,
  defaultCodexRuntimeRoot,
  type CodexMissionMode,
} from './local-fixture-codex-driver.js';
import { createPrefAgentProxyDriver } from './pref-agent-proxy-driver.js';
import { createConfiguredPrefRuntime, type PrefRuntime } from './pref-runtime.js';
import { createConfiguredProfessorDriver } from './professor-driver.js';
import { defaultWorkspaceDatabasePath, SqliteWorkspaceStore } from './sqlite-workspace-store.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface HealthResponse {
  status: 'ok';
  service: 'signal-atlas-orchestrator';
  mode: 'fixture';
  version: string;
}

export interface BuildAppOptions {
  runtime?: ExpeditionRuntime;
  prefRuntime?: PrefRuntime;
  runScheduler?: boolean;
  workspaceStore?: WorkspaceStore;
}

interface ExpeditionParams {
  id: string;
}

interface EventsQuery {
  after?: string;
}

interface ReplayQuery {
  sequence?: string;
}

interface StreamQuery {
  after?: string;
}

interface InterpretMissionBody {
  text?: unknown;
  selectedAgentId?: unknown;
}

interface FixtureScenarioBody {
  missionScenario?: unknown;
}

const allowedBrowserOrigins = new Set([
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://[::1]:4173',
]);

const configuredOrchestratorPort = (() => {
  const parsed = Number(process.env['PORT'] ?? 4317);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 4317;
})();

const allowedRequestAuthorities = new Set([
  `127.0.0.1:${configuredOrchestratorPort}`,
  `localhost:${configuredOrchestratorPort}`,
  `[::1]:${configuredOrchestratorPort}`,
  // Vite preserves the browser-facing Host while proxying HTTP and WebSocket requests.
  '127.0.0.1:4173',
  'localhost:4173',
  '[::1]:4173',
  // light-my-request's fixed authority for in-process native tests.
  'localhost:80',
]);

function hasRejectedBrowserOrigin(origin: string | undefined): boolean {
  return origin !== undefined && !allowedBrowserOrigins.has(origin);
}

function hasRejectedAuthority(authority: string | undefined): boolean {
  return authority === undefined || !allowedRequestAuthorities.has(authority.toLowerCase());
}

function publicStreamEvent(event: WorldEvent): WorldEvent {
  const cloned = structuredClone(event);
  if (cloned.type === 'forecast.committed') delete cloned.payload.privateMemo;
  return cloned;
}

function statusForRejectedCommand(issues: readonly { code: string }[]): number {
  return issues.some((issue) => issue.code === 'idempotency_conflict') ? 409 : 422;
}

function hasDisallowedPublicCommandActor(input: unknown): boolean {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false;
  const actor = (input as Record<string, unknown>)['actor'];
  if (actor === null || typeof actor !== 'object' || Array.isArray(actor)) return false;
  const record = actor as Record<string, unknown>;
  return record['kind'] !== 'player' || record['id'] !== undefined;
}

function configuredWorkspaceStore(): WorkspaceStore | undefined {
  if (process.env['NODE_ENV'] === 'test' || process.env['SIGNAL_ATLAS_E2E'] === '1') {
    return undefined;
  }
  const configured = process.env['SIGNAL_ATLAS_WORKSPACE_DB']?.trim();
  if (configured === 'off') return undefined;
  return new SqliteWorkspaceStore({ location: configured || defaultWorkspaceDatabasePath() });
}

function configuredCheckpointInterval(): number {
  const parsed = Number(process.env['SIGNAL_ATLAS_CHECKPOINT_INTERVAL'] ?? 50);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger:
      process.env['NODE_ENV'] === 'test' ? false : { level: process.env['LOG_LEVEL'] ?? 'warn' },
  });
  const prefRuntime = options.prefRuntime ?? createConfiguredPrefRuntime();
  if (options.runtime && options.workspaceStore) {
    throw new Error('Inject a workspace store through ExpeditionRuntime when supplying a runtime.');
  }
  const workspaceStore = options.runtime
    ? undefined
    : (options.workspaceStore ?? configuredWorkspaceStore());
  app.register(websocket, { options: { maxPayload: 1_024 } });
  app.addHook('onRequest', async (request, reply) => {
    if (hasRejectedAuthority(request.headers.host)) {
      return reply.code(403).send({ error: 'request_authority_not_allowed' });
    }
    if (!['DELETE', 'PATCH', 'POST', 'PUT'].includes(request.method)) return;
    const origin = request.headers.origin;
    const crossSite = request.headers['sec-fetch-site'] === 'cross-site';
    if (!hasRejectedBrowserOrigin(origin) && !crossSite) return;
    return reply.code(403).send({ error: 'browser_origin_not_allowed' });
  });
  const runtime =
    options.runtime ??
    (() => {
      const fixture = createHelios3ExpeditionFixture();
      const mode: CodexMissionMode =
        process.env['SIGNAL_ATLAS_CODEX_MODE'] === 'local' ? 'local' : 'scripted';
      const runtimeRoot =
        process.env['SIGNAL_ATLAS_CODEX_RUNTIME_ROOT'] ?? defaultCodexRuntimeRoot();
      const localCodexOptions = {
        mode,
        ...(process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE']
          ? { executable: process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'] }
          : {}),
        ...(process.env['SIGNAL_ATLAS_CODEX_MODEL']
          ? { model: process.env['SIGNAL_ATLAS_CODEX_MODEL'] }
          : {}),
        runtimeRoot,
      };
      try {
        return new ExpeditionRuntime(fixture, {
          ...(workspaceStore ? { workspaceStore } : {}),
          checkpointInterval: configuredCheckpointInterval(),
          professorDriver: createConfiguredProfessorDriver(localCodexOptions),
          missionDriverFactory: (scenario) => {
            const fallback = createConfiguredMissionDriver(fixture, scenario, localCodexOptions);
            const gateway = prefRuntime.gateway();
            return gateway ? createPrefAgentProxyDriver({ fixture, gateway, fallback }) : fallback;
          },
        });
      } catch (error: unknown) {
        try {
          workspaceStore?.close();
        } catch {
          // Preserve the startup boundary error that explains why the workspace was rejected.
        }
        throw error;
      }
    })();
  const runScheduler = options.runScheduler ?? process.env['NODE_ENV'] !== 'test';
  let scheduler: ReturnType<typeof setInterval> | undefined;
  if (runScheduler) {
    let previousTick = Date.now();
    scheduler = setInterval(() => {
      const currentTick = Date.now();
      try {
        runtime.advance(currentTick - previousTick, new Date(currentTick).toISOString());
      } catch (error: unknown) {
        app.log.error(
          {
            error:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: 'UnknownError', message: 'Unknown scheduler failure.' },
          },
          'The expedition scheduler paused after a runtime boundary failure.',
        );
      }
      previousTick = currentTick;
    }, 100);
    scheduler.unref();
  }
  app.addHook('onClose', async () => {
    if (scheduler) clearInterval(scheduler);
    await runtime.waitForRuntimeIdle();
    runtime.close();
    await prefRuntime.disconnect();
  });

  app.get<{ Reply: HealthResponse }>('/api/health', async () => ({
    status: 'ok',
    service: 'signal-atlas-orchestrator',
    mode: 'fixture',
    version: '0.0.0',
  }));

  app.get('/api/runtime/diagnostics', async () => runtime.runtimeDiagnostics());

  app.get('/api/runtime/pref', async () => prefRuntime.diagnostics());

  app.post('/api/runtime/pref/test', async () => prefRuntime.testConnection());

  app.post('/api/runtime/pref/disconnect', async () => prefRuntime.disconnect());

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

  app.register(async function expeditionStreamRoutes(streamApp) {
    streamApp.get<{ Params: ExpeditionParams; Querystring: StreamQuery }>(
      '/api/expeditions/:id/stream',
      { websocket: true },
      (socket, request) => {
        if (hasRejectedBrowserOrigin(request.headers.origin)) {
          socket.close(1008, 'browser_origin_not_allowed');
          return;
        }
        let cursor = Number(request.query.after ?? 0);
        let unsubscribe: () => void = () => undefined;
        const send = (envelope: EventStreamEnvelope) => {
          if (socket.readyState !== 1) return;
          socket.send(JSON.stringify(parseEventStreamEnvelope(envelope)));
        };
        const sendError = (
          code: Extract<EventStreamEnvelope, { type: 'world.error' }>['code'],
          message: string,
        ) => {
          send({
            schemaVersion: SCHEMA_VERSION,
            type: 'world.error',
            expeditionId: runtime.expeditionId,
            boundary: 'event_stream',
            code,
            message,
            sequence: runtime.snapshot().sequence,
          });
        };
        const close = () => unsubscribe();
        socket.once('close', close);
        socket.once('error', close);
        socket.on('message', () => {
          sendError(
            'unsupported_client_message',
            'The expedition event stream is server-to-client only.',
          );
          socket.close(1008, 'unsupported_client_message');
        });

        if (request.params.id !== runtime.expeditionId) {
          sendError('invalid_cursor', 'The requested expedition does not exist.');
          socket.close(1008, 'expedition_not_found');
          return;
        }
        const latestSequence = runtime.snapshot().sequence;
        if (!Number.isInteger(cursor) || cursor < 0 || cursor > latestSequence) {
          cursor = latestSequence;
          sendError(
            'invalid_cursor',
            `Stream cursor must be an integer from 0 through ${latestSequence}.`,
          );
          socket.close(1008, 'invalid_cursor');
          return;
        }

        const sendEvents = (events: readonly WorldEvent[]) => {
          const unseen = events.filter((event) => event.sequence > cursor);
          for (let index = 0; index < unseen.length; index += 100) {
            const chunk = unseen.slice(index, index + 100);
            const first = chunk[0];
            const last = chunk.at(-1);
            if (!first || !last) continue;
            if (first.sequence !== cursor + 1) {
              sendError(
                'sequence_gap',
                `Expected event sequence ${cursor + 1}; received ${first.sequence}.`,
              );
              socket.close(1011, 'sequence_gap');
              return;
            }
            send({
              schemaVersion: SCHEMA_VERSION,
              type: 'world.events',
              expeditionId: runtime.expeditionId,
              afterSequence: cursor,
              sequence: last.sequence,
              events: chunk.map(publicStreamEvent),
            });
            cursor = last.sequence;
          }
        };

        unsubscribe = runtime.subscribeEvents(sendEvents);
        sendEvents(runtime.eventsAfter(cursor));
        send({
          schemaVersion: SCHEMA_VERSION,
          type: 'world.ready',
          expeditionId: runtime.expeditionId,
          sequence: cursor,
        });
      },
    );
  });

  app.get<{ Params: ExpeditionParams; Querystring: ReplayQuery }>(
    '/api/expeditions/:id/replay',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      const sequence = Number(request.query.sequence ?? runtime.snapshot().sequence);
      try {
        return runtime.replayAt(sequence);
      } catch (error: unknown) {
        if (error instanceof ReplaySequenceError) {
          return reply.code(400).send({ error: 'invalid_replay_sequence', message: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: ExpeditionParams }>(
    '/api/expeditions/:id/case-file',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      reply.header(
        'content-disposition',
        `attachment; filename="signal-atlas-${runtime.expeditionId}-case-file.json"`,
      );
      return runtime.caseFile();
    },
  );

  app.post<{ Params: ExpeditionParams; Body: unknown }>(
    '/api/expeditions/:id/resolve-fixture',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      if (
        request.body !== undefined &&
        (request.body === null ||
          typeof request.body !== 'object' ||
          Array.isArray(request.body) ||
          Object.keys(request.body).length > 0)
      ) {
        return reply.code(400).send({ error: 'fixture_resolution_body_must_be_empty' });
      }
      try {
        const result = runtime.resolveFromFixture();
        return reply.code(result.duplicate ? 200 : 202).send(result);
      } catch (error: unknown) {
        if (error instanceof FixtureResolutionConflictError) {
          return reply
            .code(409)
            .send({ error: 'fixture_resolution_conflict', message: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: ExpeditionParams }>(
    '/api/expeditions/:id/fixture-configuration',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      return runtime.fixtureConfiguration();
    },
  );

  app.put<{ Params: ExpeditionParams; Body: FixtureScenarioBody }>(
    '/api/expeditions/:id/fixture-configuration',
    async (request, reply) => {
      if (request.params.id !== runtime.expeditionId) {
        return reply.code(404).send({ error: 'expedition_not_found' });
      }
      const scenario = request.body?.missionScenario;
      if (
        typeof scenario !== 'string' ||
        !fixtureMissionScenarios.includes(scenario as FixtureMissionScenario)
      ) {
        return reply.code(400).send({
          error: 'invalid_fixture_mission_scenario',
          allowed: fixtureMissionScenarios,
        });
      }
      runtime.setFixtureMissionScenario(scenario as FixtureMissionScenario);
      return runtime.fixtureConfiguration();
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
      if (hasDisallowedPublicCommandActor(request.body)) {
        return reply.code(403).send({ error: 'command_actor_not_allowed' });
      }
      const result = runtime.submit(request.body);
      if (!result.accepted) {
        return reply.code(statusForRejectedCommand(result.issues)).send(result);
      }
      return reply.code(result.duplicate ? 200 : 202).send(result);
    },
  );

  if (process.env['SIGNAL_ATLAS_E2E'] === '1') {
    const closeEventStreams = (code: number, reason: string) => {
      let closed = 0;
      for (const client of app.websocketServer.clients) {
        if (client.readyState !== 1) continue;
        client.close(code, reason);
        closed += 1;
      }
      return closed;
    };
    app.post('/api/testing/reset', async () => {
      closeEventStreams(1012, 'fixture_reset');
      runtime.resetToFixture();
      return { reset: true, sequence: runtime.snapshot().sequence };
    });

    app.post('/api/testing/disconnect-streams', async () => ({
      disconnected: closeEventStreams(1012, 'injected_temporary_outage'),
      sequence: runtime.snapshot().sequence,
    }));

    app.post('/api/testing/emit-invalid-stream-envelope', async () => {
      let sent = 0;
      for (const client of app.websocketServer.clients) {
        if (client.readyState !== 1) continue;
        client.send(
          JSON.stringify({
            schemaVersion: 999,
            type: 'world.events',
            boundary: 'injected_invalid_schema',
          }),
        );
        sent += 1;
      }
      return { sent, sequence: runtime.snapshot().sequence };
    });
  }

  return app;
}
