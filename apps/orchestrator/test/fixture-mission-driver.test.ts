import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
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
});
