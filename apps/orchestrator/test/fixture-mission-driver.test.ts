import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  createFixtureCodexDriver,
  createScriptedFixtureTurn,
  type FixtureMissionScenario,
} from '../src/fixture-mission-driver.js';

const fixture = createHelios3ExpeditionFixture();
const mission = {
  id: 'mission-driver-weather-1',
  expeditionId: fixture.expedition.id,
  assignedAgentId: 'mira',
  verb: 'observe_conditions' as const,
  objective: 'Check the latest weather.',
  destinationPlaceId: 'weather-tower',
  budget: { maxToolCalls: 3, timeoutMs: 30_000 },
  status: 'running' as const,
  createdBy: { kind: 'player' as const },
  createdAt: '2027-09-26T18:32:00Z',
};

describe('scripted fixture mission driver', () => {
  it('resolves authored evidence and stable audit identities from the fixture seed', () => {
    const first = createScriptedFixtureTurn(fixture, {
      mission,
      effectivePlaceId: 'weather-tower',
      attempt: 1,
      scenario: 'success',
    });
    const second = createScriptedFixtureTurn(fixture, {
      mission,
      effectivePlaceId: 'weather-tower',
      attempt: 1,
      scenario: 'success',
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      scenario: 'success',
      latencyMs: 2_400,
      sources: [{ id: 'src-weather-bulletin-1' }],
      claims: [{ id: 'claim-crosswind' }],
      signals: [{ id: 'sig-crosswind' }],
    });
    expect(first.argumentsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each<FixtureMissionScenario>(['no_result', 'timeout', 'invalid_result'])(
    'injects a deterministic %s outcome without exposing authored entities',
    (scenario) => {
      const result = createScriptedFixtureTurn(fixture, {
        mission,
        effectivePlaceId: 'weather-tower',
        attempt: 1,
        scenario,
      });

      expect(result.scenario).toBe(scenario);
      expect(result.sources).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.signals).toEqual([]);
      expect(result.dialogue.length).toBeGreaterThan(0);
    },
  );

  it('degrades an unsupported mission key to a recoverable no-result script', () => {
    const result = createScriptedFixtureTurn(fixture, {
      mission: { ...mission, assignedAgentId: 'orin' },
      effectivePlaceId: 'weather-tower',
      attempt: 1,
      scenario: 'success',
    });

    expect(result).toMatchObject({ scenario: 'no_result', sources: [], signals: [] });
  });

  it('exposes authored behavior only through the shared CodexDriver contract', () => {
    const driver = createFixtureCodexDriver(fixture, () => 'success');
    const result = driver.runTurn(
      {
        schemaVersion: 1,
        turnId: 'turn-driver-contract-1',
        expeditionId: fixture.expedition.id,
        agentId: 'mira',
        mission,
        effectivePlaceId: 'weather-tower',
        attempt: 1,
        knownSourceIds: [],
        knownSignalIds: [],
        allowedCapabilities: ['local_conditions'],
        requestedAt: '2027-09-26T18:32:00Z',
        timeoutMs: 30_000,
      },
      {
        signal: new AbortController().signal,
        deadlineAt: '2027-09-26T18:32:30Z',
        emit: () => undefined,
      },
    );
    if (result instanceof Promise) throw new Error('Fixture driver must stay deterministic.');

    expect(result.output).toMatchObject({
      agentId: 'mira',
      missionId: mission.id,
      action: { type: 'investigate', capability: 'local_conditions' },
      sourceIdsUsed: ['src-weather-bulletin-1'],
      proposedClaims: [{ sourceIds: ['src-weather-bulletin-1'] }],
      proposedSignals: [{ headline: 'Crosswind advisory overlaps launch window' }],
    });
    expect(result.artifacts).toMatchObject({
      turnId: 'turn-driver-contract-1',
      signals: [{ id: 'sig-crosswind' }],
    });
    expect(driver.diagnostics()).toMatchObject({
      id: 'fixture-scripted-codex',
      kind: 'scripted',
      runs: 1,
    });
  });
});
