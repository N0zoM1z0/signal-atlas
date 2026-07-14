import { AgentTurnInputSchema, type AgentTurnInput } from '@signal-atlas/contracts';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { buildFixtureCodexPromptContext } from '../src/local-fixture-codex-driver.js';

function turnInput(
  agentId: string,
  verb: AgentTurnInput['mission']['verb'],
  placeId: string,
): AgentTurnInput {
  return AgentTurnInputSchema.parse({
    schemaVersion: 1,
    turnId: `turn-${agentId}-${verb}`,
    expeditionId: 'exp-helios3-demo',
    agentId,
    mission: {
      id: `mission-${agentId}-${verb}`,
      expeditionId: 'exp-helios3-demo',
      assignedAgentId: agentId,
      verb,
      objective: 'Inspect only the evidence authorized for this fixture turn.',
      destinationPlaceId: placeId,
      budget: { maxToolCalls: 1, timeoutMs: 5_000 },
      status: 'running',
      createdBy: { kind: 'player' },
      createdAt: '2027-09-26T18:00:00Z',
      startedAt: '2027-09-26T18:01:00Z',
    },
    effectivePlaceId: placeId,
    attempt: 1,
    knownSourceIds: [],
    knownSignalIds: [],
    allowedCapabilities: ['search_sources', 'read_source', 'local_conditions'],
    requestedAt: '2027-09-26T18:01:00Z',
    timeoutMs: 5_000,
  });
}

describe('fixture Codex profile packets', () => {
  it('does not expose the archive signal to Mira during a weather mission', () => {
    const context = buildFixtureCodexPromptContext(
      createHelios3ExpeditionFixture(),
      turnInput('mira', 'observe_conditions', 'weather-tower'),
    );

    expect(context.profile.profileId).toBe('scout.v1');
    expect(context.knowledge.sources.map(({ id }) => id)).toEqual(['src-weather-bulletin-1']);
    expect(context.knowledge.signals).toEqual([]);
    expect(context.knowledge.access.archiveGrant).toBeUndefined();
    expect(JSON.stringify(context.knowledge)).not.toContain('sig-base-rate');
  });

  it('grants Orin bounded archive records for an archive mission', () => {
    const context = buildFixtureCodexPromptContext(
      createHelios3ExpeditionFixture(),
      turnInput('orin', 'search_history', 'archive'),
    );

    expect(context.profile.profileId).toBe('archivist.v1');
    expect(context.knowledge.access.archiveGrant).toMatchObject({
      placeId: 'archive',
      missionVerb: 'search_history',
    });
    expect(context.knowledge.sources.map(({ id }) => id)).toContain('src-archive-crosswind-1');
    expect(context.knowledge.signals.map(({ id }) => id)).toContain('sig-base-rate');
  });

  it('keeps the evidence packet identical when only the agent style changes', () => {
    const fixture = createHelios3ExpeditionFixture();
    const input = turnInput('mira', 'observe_conditions', 'weather-tower');
    const scout = buildFixtureCodexPromptContext(fixture, input);
    const restyledFixture = structuredClone(fixture);
    const mira = restyledFixture.agents.find((agent) => agent.id === 'mira');
    if (!mira) throw new Error('Fixture Mira is missing.');
    mira.role = 'skeptic';
    const skeptic = buildFixtureCodexPromptContext(restyledFixture, input);

    expect(scout.profile.publicBehavior).not.toBe(skeptic.profile.publicBehavior);
    expect(scout.knowledge).toEqual(skeptic.knowledge);
  });
});
