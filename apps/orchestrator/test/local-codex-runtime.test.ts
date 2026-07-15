import { writeFileSync } from 'node:fs';

import type { AgentTurnOutput } from '@signal-atlas/contracts';
import {
  CodexDriverError,
  type CodexProcessRequest,
  type CodexProcessResult,
} from '@signal-atlas/codex-runtime';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ExpeditionRuntime } from '../src/expedition-runtime.js';
import { createConfiguredMissionDriver } from '../src/local-fixture-codex-driver.js';

function assignmentCommand(timeoutMs = 5_000) {
  return {
    id: 'cmd-mira-local-weather-1',
    idempotencyKey: 'mission:mira:local-weather:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:00Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.assign_mission',
    payload: {
      mission: {
        id: 'mission-mira-local-weather-1',
        expeditionId: 'exp-helios3-demo',
        assignedAgentId: 'mira',
        verb: 'observe_conditions',
        objective: 'Check the latest weather at Galehaven Weather Tower.',
        destinationPlaceId: 'weather-tower',
        budget: { maxToolCalls: 1, timeoutMs },
        status: 'draft',
        createdBy: { kind: 'player' },
        createdAt: '2027-09-26T18:32:00Z',
      },
    },
  };
}

function skipWeatherCommand() {
  return {
    id: 'cmd-skip-local-weather-1',
    idempotencyKey: 'skip:mira:local-weather:1',
    expeditionId: 'exp-helios3-demo',
    issuedAt: '2027-09-26T18:32:01Z',
    actor: { kind: 'player' },
    schemaVersion: 1,
    type: 'agent.skip_travel',
    payload: { agentId: 'mira', missionId: 'mission-mira-local-weather-1' },
  };
}

function validOutput(sourceId = 'src-weather-bulletin-1'): AgentTurnOutput {
  return {
    schemaVersion: 1,
    agentId: 'mira',
    missionId: 'mission-mira-local-weather-1',
    action: {
      type: 'investigate',
      capability: 'local_conditions',
      query: 'Check the latest weather at Galehaven Weather Tower.',
    },
    publicDialogue:
      'The fresh tower advisory overlaps only part of the window, so it is negative but not decisive.',
    sourceIdsUsed: [sourceId],
    proposedClaims: [
      {
        text: 'Crosswinds overlap part of the fictional launch window.',
        sourceIds: [sourceId],
        qualifiers: ['partial-window'],
      },
    ],
    proposedSignals: [
      {
        headline: 'Crosswind advisory overlaps launch window',
        summary: 'The bounded advisory is negative but not decisive.',
        claimIndexes: [0],
        sourceIds: [sourceId],
        direction: 'opposes_outcome',
        targetOutcomeId: 'yes',
        impactLabel: 'small',
      },
    ],
    rationale: 'The supplied tower source directly supports a limited negative update.',
    assumptions: ['The fixture advisory is current at the recorded observation time.'],
    unknowns: ['Conditions after the advisory interval remain unknown.'],
  };
}

function processRunner(
  rawOutputs: readonly string[],
  requests: CodexProcessRequest[],
): (request: CodexProcessRequest) => Promise<CodexProcessResult> {
  let attempt = 0;
  return async (request) => {
    requests.push(request);
    const outputPath = request.args[request.args.indexOf('-o') + 1];
    if (!outputPath) throw new Error('Local runtime command omitted -o.');
    writeFileSync(outputPath, rawOutputs[Math.min(attempt, rawOutputs.length - 1)] ?? '', 'utf8');
    attempt += 1;
    return {
      exitCode: 0,
      signal: null,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'session-mira-local-fixture' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 40 } }),
      ].join('\n'),
      stderr: '',
      aborted: false,
    };
  };
}

function localRuntime(
  rawOutputs: readonly string[],
  requests: CodexProcessRequest[] = [],
): ExpeditionRuntime {
  const fixture = createHelios3ExpeditionFixture();
  return new ExpeditionRuntime(fixture, {
    missionDriverFactory: (scenario) =>
      createConfiguredMissionDriver(fixture, scenario, {
        mode: 'local',
        executable: '/test/bin/codex',
        processRunner: processRunner(rawOutputs, requests),
        isAvailable: () => true,
      }),
  });
}

async function runWeatherTurn(runtime: ExpeditionRuntime): Promise<void> {
  expect(runtime.submit(assignmentCommand())).toMatchObject({ accepted: true });
  expect(runtime.submit(skipWeatherCommand())).toMatchObject({ accepted: true });
  await runtime.waitForRuntimeIdle();
  runtime.advance(1, '2027-09-26T18:32:02Z');
}

describe('local Codex world integration', () => {
  it('lets Mira complete a bounded fixture mission through asynchronous local Codex', async () => {
    const requests: CodexProcessRequest[] = [];
    const runtime = localRuntime([JSON.stringify(validOutput())], requests);

    await runWeatherTurn(runtime);

    const snapshot = runtime.snapshot();
    expect(snapshot.sourcesById['src-weather-bulletin-1']).toBeDefined();
    expect(snapshot.claimsById['claim-crosswind']).toBeDefined();
    expect(snapshot.signalsById['sig-crosswind']).toBeDefined();
    expect(snapshot.missionsById['mission-mira-local-weather-1']?.status).toBe('completed');
    expect(snapshot.agentTurnsById['turn-mission-mira-local-weather-1-1']).toMatchObject({
      profileId: 'scout.v1',
      profileVersion: 1,
      publicRationale: 'The supplied tower source directly supports a limited negative update.',
      unknowns: ['Conditions after the advisory interval remain unknown.'],
    });
    expect(runtime.runtimeDiagnostics()).toMatchObject({
      driver: {
        kind: 'local_exec',
        activeMode: 'local_exec',
        fallback: { used: false },
        command: { executable: '/test/bin/codex' },
      },
      scheduler: { activeCount: 0, queuedCount: 0 },
      totals: { completed: 1 },
    });
    const command = runtime.runtimeDiagnostics().driver.command;
    expect(command?.args).toContain('read-only');
    expect(command?.args).toContain('--output-schema');
    expect(command?.display).not.toMatch(/secret|token|password/iu);
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['invalid JSON', 'not-json'],
    ['an unknown source ID', JSON.stringify(validOutput('src-not-in-packet'))],
  ])('accepts no evidence after %s fails its one repair', async (_label, rawOutput) => {
    const runtime = localRuntime([rawOutput, rawOutput]);
    const before = runtime.snapshot();

    await runWeatherTurn(runtime);

    const after = runtime.snapshot();
    expect(after.sourcesById).toEqual(before.sourcesById);
    expect(after.claimsById).toEqual(before.claimsById);
    expect(after.signalsById).toEqual(before.signalsById);
    expect(after.agentsById['mira']?.belief).toEqual(before.agentsById['mira']?.belief);
    expect(after.agentTurnsById['turn-mission-mira-local-weather-1-1']).toMatchObject({
      status: 'completed',
      sourceIds: [],
      signalIds: [],
    });
  });

  it('falls back to the deterministic fixture driver when Codex is absent', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture, {
      missionDriverFactory: (scenario) =>
        createConfiguredMissionDriver(fixture, scenario, {
          mode: 'local',
          executable: '/definitely/missing/signal-atlas-codex',
        }),
    });

    await runWeatherTurn(runtime);

    expect(runtime.snapshot().signalsById['sig-crosswind']).toBeDefined();
    expect(runtime.runtimeDiagnostics().driver).toMatchObject({
      activeMode: 'scripted_fallback',
      fallback: { driverId: 'fixture-scripted-codex', used: true },
    });
  });

  it('projects a scheduler timeout as an explicit failed world turn', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const runtime = new ExpeditionRuntime(fixture, {
      missionDriverFactory: (scenario) =>
        createConfiguredMissionDriver(fixture, scenario, {
          mode: 'local',
          executable: '/test/bin/codex',
          isAvailable: () => true,
          processRunner: async (request) => {
            await new Promise<void>((resolve) =>
              request.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
            return {
              exitCode: null,
              signal: 'SIGTERM',
              stdout: '',
              stderr: '',
              aborted: true,
            };
          },
        }),
    });
    runtime.submit(assignmentCommand(20));
    runtime.submit(skipWeatherCommand());

    await runtime.waitForRuntimeIdle();
    runtime.advance(1, '2027-09-26T18:32:02Z');

    expect(runtime.runtimeDiagnostics()).toMatchObject({ totals: { timed_out: 1 } });
    expect(runtime.snapshot().agentTurnsById['turn-mission-mira-local-weather-1-1']).toMatchObject({
      status: 'failed',
      code: 'runtime_timeout',
      recoverable: true,
    });
    expect(runtime.snapshot().sourcesById['src-weather-bulletin-1']).toBeUndefined();
  });

  it('keeps process prompt, source, and proxy details out of every world-facing surface', async () => {
    const fixture = createHelios3ExpeditionFixture();
    const sentinel =
      'PROMPT-SENTINEL SOURCE-SENTINEL HTTPS_PROXY=https://proxy-user:proxy-pass@localhost:7890';
    const runtime = new ExpeditionRuntime(fixture, {
      missionDriverFactory: (scenario) =>
        createConfiguredMissionDriver(fixture, scenario, {
          mode: 'local',
          executable: '/test/bin/codex',
          isAvailable: () => true,
          processRunner: async () => {
            throw new CodexDriverError('proxy-pass-sentinel', sentinel);
          },
        }),
    });

    await runWeatherTurn(runtime);

    const serialized = JSON.stringify({
      diagnostics: runtime.runtimeDiagnostics(),
      projection: runtime.snapshot(),
      events: runtime.eventsAfter(0),
      caseFile: runtime.caseFile(),
    });
    expect(serialized).not.toMatch(
      /PROMPT-SENTINEL|SOURCE-SENTINEL|proxy-user|proxy-pass|proxy-pass-sentinel/u,
    );
    expect(serialized).toContain(
      'The Codex runtime failed before a validated result was accepted.',
    );
  });
});
