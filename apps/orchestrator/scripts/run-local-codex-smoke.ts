import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { createConfiguredMissionDriver } from '../src/local-fixture-codex-driver.js';

const fixture = createHelios3ExpeditionFixture();
const runtime = new ExpeditionRuntime(fixture, {
  missionDriverFactory: (scenario) =>
    createConfiguredMissionDriver(fixture, scenario, {
      mode: 'local',
      ...(process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE']
        ? { executable: process.env['SIGNAL_ATLAS_CODEX_EXECUTABLE'] }
        : {}),
      ...(process.env['SIGNAL_ATLAS_CODEX_MODEL']
        ? { model: process.env['SIGNAL_ATLAS_CODEX_MODEL'] }
        : {}),
      ...(process.env['SIGNAL_ATLAS_CODEX_RUNTIME_ROOT']
        ? { runtimeRoot: process.env['SIGNAL_ATLAS_CODEX_RUNTIME_ROOT'] }
        : {}),
    }),
});

const issuedAt = '2027-09-26T18:32:00Z';
const missionId = 'mission-mira-live-codex-smoke';
const assignment = runtime.submit({
  id: 'cmd-mira-live-codex-smoke',
  idempotencyKey: 'smoke:mira:local-codex:1',
  expeditionId: runtime.expeditionId,
  issuedAt,
  actor: { kind: 'player' },
  schemaVersion: 1,
  type: 'agent.assign_mission',
  payload: {
    mission: {
      id: missionId,
      expeditionId: runtime.expeditionId,
      assignedAgentId: 'mira',
      verb: 'observe_conditions',
      objective: 'Check the latest weather at Galehaven Weather Tower.',
      destinationPlaceId: 'weather-tower',
      budget: { maxToolCalls: 1, timeoutMs: 120_000 },
      status: 'draft',
      createdBy: { kind: 'player' },
      createdAt: issuedAt,
    },
  },
});
if (!assignment.accepted) throw new Error('The local Codex smoke mission was rejected.');

const skipped = runtime.submit({
  id: 'cmd-skip-mira-live-codex-smoke',
  idempotencyKey: 'smoke:mira:local-codex:skip:1',
  expeditionId: runtime.expeditionId,
  issuedAt: '2027-09-26T18:32:01Z',
  actor: { kind: 'player' },
  schemaVersion: 1,
  type: 'agent.skip_travel',
  payload: { agentId: 'mira', missionId },
});
if (!skipped.accepted) throw new Error('The local Codex smoke travel skip was rejected.');

await runtime.waitForRuntimeIdle();
runtime.advance(1, '2027-09-26T18:34:01Z');

const projection = runtime.snapshot();
const turn = Object.values(projection.agentTurnsById).find(
  (candidate) => candidate.missionId === missionId,
);
const diagnostics = runtime.runtimeDiagnostics();
const result = {
  completed: turn?.status === 'completed' && (turn.signalIds?.length ?? 0) > 0,
  missionStatus: projection.missionsById[missionId]?.status,
  turnStatus: turn?.status,
  sourceIds: turn?.sourceIds ?? [],
  signalIds: turn?.signalIds ?? [],
  driver: diagnostics.driver,
  scheduler: diagnostics.scheduler,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.completed) process.exitCode = 1;
