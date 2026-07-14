import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AgentTurnOutputSchema,
  ExpeditionFixtureSchema,
  WorldCommandSchema,
  WorldEventSchema,
  type ExpeditionFixture,
} from '../src/index.js';

const fixturePath = new URL('../../../fixtures/helios3_expedition.json', import.meta.url);
const fixtureText = readFileSync(fixturePath, 'utf8');
const fixtureInput: unknown = JSON.parse(fixtureText);
const canonicalFixture = ExpeditionFixtureSchema.parse(fixtureInput);

function cloneFixture(): ExpeditionFixture {
  return structuredClone(canonicalFixture);
}

function fixtureIssues(candidate: unknown) {
  const result = ExpeditionFixtureSchema.safeParse(candidate);
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('Expected fixture validation to fail.');
  }
  return result.error.issues;
}

function expectIssue(
  issues: ReturnType<typeof fixtureIssues>,
  path: ReadonlyArray<string | number>,
  message: string,
) {
  expect(
    issues.some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) && issue.message.includes(message),
    ),
  ).toBe(true);
}

describe('Helios-3 expedition fixture', () => {
  it('imports the supplied fixture unchanged through the complete domain boundary', () => {
    expect(canonicalFixture).toMatchObject({
      fixtureVersion: 1,
      seed: 'helios3-cozy-intelligence-v1',
      market: { id: 'market-helios3-2027' },
      expedition: { id: 'exp-helios3-demo', currentSequence: 2 },
      worldManifest: { id: 'world-helios3-v1' },
    });
    expect(canonicalFixture.agents).toHaveLength(3);
    expect(canonicalFixture.sources).toHaveLength(6);
    expect(canonicalFixture.claims).toHaveLength(3);
    expect(canonicalFixture.signals).toHaveLength(3);
    expect(canonicalFixture.initialEvents).toHaveLength(2);
    expect(readFileSync(fixturePath, 'utf8')).toBe(fixtureText);
  });

  it('rejects a market whose probabilities do not sum to one with a precise path', () => {
    const fixture = cloneFixture();
    if (!fixture.market.currentPublicProbabilities) {
      throw new Error('The canonical fixture must contain public probabilities.');
    }
    fixture.market.currentPublicProbabilities['yes'] = 0.7;

    expectIssue(fixtureIssues(fixture), ['market', 'currentPublicProbabilities'], 'must sum to 1');
  });

  it('requires exactly two unique market outcomes and matching probability keys', () => {
    const fixture = cloneFixture();
    fixture.market.outcomes.push({
      id: 'maybe',
      label: 'Maybe',
      shortLabel: 'MAYBE',
    });

    const issues = fixtureIssues(fixture);
    expectIssue(issues, ['market', 'outcomes'], 'Too big');
    expectIssue(
      issues,
      ['market', 'currentPublicProbabilities'],
      'exactly match the market outcome IDs',
    );
  });

  it('rejects inverted uncertainty and impact ranges at the low endpoint', () => {
    const uncertaintyFixture = cloneFixture();
    const uncertainty = uncertaintyFixture.agents[0]?.belief.uncertainty?.['yes'];
    if (!uncertainty) {
      throw new Error('The canonical fixture must contain Mira uncertainty.');
    }
    uncertainty.low = 0.9;
    uncertainty.high = 0.2;
    expectIssue(
      fixtureIssues(uncertaintyFixture),
      ['agents', 0, 'belief', 'uncertainty', 'yes', 'low'],
      'less than or equal',
    );

    const impactFixture = cloneFixture();
    const impact = impactFixture.signals[0]?.impact.probabilityPointRange;
    if (!impact) {
      throw new Error('The canonical fixture must contain signal impact bounds.');
    }
    impact.low = 0.2;
    impact.high = -0.2;
    expectIssue(
      fixtureIssues(impactFixture),
      ['signals', 0, 'impact', 'probabilityPointRange', 'low'],
      'less than or equal',
    );
  });

  it('rejects dangling source identities in both claims and signals', () => {
    const claimFixture = cloneFixture();
    const claim = claimFixture.claims[0];
    if (!claim) {
      throw new Error('The canonical fixture must contain a claim.');
    }
    claim.sourceIds[0] = 'src-does-not-exist';
    expectIssue(
      fixtureIssues(claimFixture),
      ['claims', 0, 'sourceIds', 0],
      'references unknown ID',
    );

    const signalFixture = cloneFixture();
    const signal = signalFixture.signals[0];
    if (!signal) {
      throw new Error('The canonical fixture must contain a signal.');
    }
    signal.sourceIds[0] = 'src-does-not-exist';
    const issues = fixtureIssues(signalFixture);
    expectIssue(issues, ['signals', 0, 'sourceIds', 0], 'references unknown ID');
    expectIssue(issues, ['signals', 0, 'sourceIds'], 'must include source');
  });

  it('rejects dangling world, agent, and information references', () => {
    const fixture = cloneFixture();
    fixture.worldManifest.defaultSpawnPlaceId = 'the-void';
    const route = fixture.worldManifest.routes[0];
    const agent = fixture.agents[0];
    const signal = fixture.signals[0];
    if (!route || !agent || !signal) {
      throw new Error('The canonical fixture must contain a route, agent, and signal.');
    }
    route.toPlaceId = 'the-void';
    agent.placeId = 'the-void';
    agent.knownSourceIds.push('src-does-not-exist');
    agent.knownSignalIds.push('sig-does-not-exist');
    signal.targetOutcomeId = 'maybe';
    signal.discoveredByAgentId = 'unknown-agent';

    const issues = fixtureIssues(fixture);
    expectIssue(issues, ['worldManifest', 'defaultSpawnPlaceId'], 'must reference a place');
    expectIssue(issues, ['worldManifest', 'routes', 0, 'toPlaceId'], 'must reference a place');
    expectIssue(issues, ['agents', 0, 'placeId'], 'references unknown ID');
    expectIssue(issues, ['agents', 0, 'knownSourceIds', 0], 'references unknown ID');
    expectIssue(issues, ['agents', 0, 'knownSignalIds', 0], 'references unknown ID');
    expectIssue(issues, ['signals', 0, 'targetOutcomeId'], 'references unknown ID');
    expectIssue(issues, ['signals', 0, 'discoveredByAgentId'], 'references unknown ID');
  });

  it('requires contiguous event sequences, unique IDs, and an aligned expedition cursor', () => {
    const fixture = cloneFixture();
    const secondEvent = fixture.initialEvents[1];
    if (!secondEvent) {
      throw new Error('The canonical fixture must contain a second event.');
    }
    secondEvent.id = fixture.initialEvents[0]?.id ?? secondEvent.id;
    secondEvent.sequence = 7;

    const issues = fixtureIssues(fixture);
    expectIssue(issues, ['initialEvents', 1, 'id'], 'Duplicate event ID');
    expectIssue(issues, ['initialEvents', 1, 'sequence'], 'must be contiguous from 1');
    expectIssue(issues, ['expedition', 'currentSequence'], 'does not match last initial event');
  });

  it('validates scripted mission and Professor evidence identities', () => {
    const fixture = cloneFixture();
    const originalResult = fixture.scriptedMissionResults['mira:observe_conditions:weather-tower'];
    if (!originalResult) {
      throw new Error('The canonical fixture must contain Mira scripted mission output.');
    }
    fixture.scriptedMissionResults['unknown:teleport:the-void'] = originalResult;
    const evidence = fixture.professorFixture.evidenceUsed[0];
    if (!evidence) {
      throw new Error('The canonical fixture must contain Professor evidence.');
    }
    evidence.id = 'sig-does-not-exist';

    const issues = fixtureIssues(fixture);
    expectIssue(
      issues,
      ['scriptedMissionResults', 'unknown:teleport:the-void'],
      'Scripted mission agent references unknown ID',
    );
    expectIssue(
      issues,
      ['scriptedMissionResults', 'unknown:teleport:the-void'],
      'uses unknown verb',
    );
    expectIssue(
      issues,
      ['scriptedMissionResults', 'unknown:teleport:the-void'],
      'Scripted mission place references unknown ID',
    );
    expectIssue(issues, ['professorFixture', 'evidenceUsed', 0, 'id'], 'references unknown ID');
  });
});

describe('event, command, and agent-turn envelopes', () => {
  it('accepts fixture events and rejects unknown event types and schema versions', () => {
    for (const event of canonicalFixture.initialEvents) {
      expect(WorldEventSchema.safeParse(event).success).toBe(true);
    }

    const firstEvent = canonicalFixture.initialEvents[0];
    if (!firstEvent) {
      throw new Error('The canonical fixture must contain an initial event.');
    }

    const unknownType = structuredClone(firstEvent);
    Object.assign(unknownType, { type: 'runtime.magic' });
    expect(WorldEventSchema.safeParse(unknownType).success).toBe(false);

    const unknownVersion = structuredClone(firstEvent);
    Object.assign(unknownVersion, { schemaVersion: 2 });
    const versionResult = WorldEventSchema.safeParse(unknownVersion);
    expect(versionResult.success).toBe(false);
    if (!versionResult.success) {
      expect(versionResult.error.issues.some((issue) => issue.path[0] === 'schemaVersion')).toBe(
        true,
      );
    }
  });

  it('uses a closed command vocabulary and excludes infrastructure actors', () => {
    const command = {
      id: 'cmd-1',
      idempotencyKey: 'idempotent-cmd-1',
      expeditionId: canonicalFixture.expedition.id,
      issuedAt: '2027-09-26T18:00:02Z',
      actor: { kind: 'player' },
      schemaVersion: 1,
      type: 'expedition.start',
      payload: {},
    };
    expect(WorldCommandSchema.safeParse(command).success).toBe(true);
    expect(WorldCommandSchema.safeParse({ ...command, actor: { kind: 'pref' } }).success).toBe(
      false,
    );
    expect(WorldCommandSchema.safeParse({ ...command, type: 'filesystem.write' }).success).toBe(
      false,
    );
  });

  it('keeps agent claims and signals grounded in declared turn sources', () => {
    const turn = {
      schemaVersion: 1,
      agentId: 'mira',
      missionId: 'mission-weather-1',
      action: { type: 'wait', reason: 'Await the next observation.' },
      publicDialogue: 'The local advisory is fresh, but the next observation is pending.',
      sourceIdsUsed: ['src-weather-bulletin-1'],
      proposedClaims: [
        {
          text: 'Crosswinds overlap part of the window.',
          sourceIds: ['src-weather-bulletin-1'],
          qualifiers: ['forecast'],
        },
      ],
      proposedSignals: [
        {
          headline: 'Crosswind overlap',
          summary: 'The opening window carries elevated wind risk.',
          claimIndexes: [0],
          sourceIds: ['src-weather-bulletin-1'],
          direction: 'opposes_outcome',
          targetOutcomeId: 'yes',
          impactLabel: 'medium',
        },
      ],
      rationale: 'The source is official, local, and recent.',
      assumptions: ['The published window remains current.'],
      unknowns: ['The readiness-poll result is not available.'],
    };
    expect(AgentTurnOutputSchema.safeParse(turn).success).toBe(true);

    const undeclaredSource = structuredClone(turn);
    undeclaredSource.proposedClaims[0]!.sourceIds[0] = 'src-hidden';
    const sourceResult = AgentTurnOutputSchema.safeParse(undeclaredSource);
    expect(sourceResult.success).toBe(false);
    if (!sourceResult.success) {
      expect(
        sourceResult.error.issues.some(
          (issue) =>
            JSON.stringify(issue.path) === JSON.stringify(['proposedClaims', 0, 'sourceIds', 0]) &&
            issue.message.includes('sourceIdsUsed'),
        ),
      ).toBe(true);
    }

    const missingClaim = structuredClone(turn);
    missingClaim.proposedSignals[0]!.claimIndexes[0] = 12;
    expect(AgentTurnOutputSchema.safeParse(missingClaim).success).toBe(false);
  });
});
