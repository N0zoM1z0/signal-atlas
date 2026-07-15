import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AgentTurnOutputSchema,
  AgentTurnInputSchema,
  EventStreamEnvelopeSchema,
  ExpeditionFixtureSchema,
  WorldCommandSchema,
  WorldEventSchema,
  EntityIdSchema,
  binaryMarketOutcomes,
  type ExpeditionFixture,
  MissionSchema,
  ScenarioDefinitionSchema,
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
  it('exposes binary outcomes by authored order without interpreting their IDs', () => {
    const fixture = cloneFixture();
    fixture.market.outcomes[0] = {
      id: 'open-before-cutoff',
      label: 'Opens before the cutoff',
      shortLabel: 'OPEN',
    };
    fixture.market.outcomes[1] = {
      id: 'stays-closed',
      label: 'Stays closed through the cutoff',
      shortLabel: 'CLOSED',
    };

    expect(binaryMarketOutcomes(fixture.market)).toEqual({
      primary: fixture.market.outcomes[0],
      secondary: fixture.market.outcomes[1],
    });
  });

  it('validates scenario presentation and capabilities against the complete fixture', () => {
    const fixture = cloneFixture();
    const definition = ScenarioDefinitionSchema.parse({
      definitionSchemaVersion: 1,
      scenario: {
        id: 'helios-3-launch-window',
        version: 1,
        title: fixture.expedition.title,
        category: 'science_technology',
        summary: 'A deterministic launch-window research challenge.',
        mode: 'fixture',
        requiredCapabilities: ['local_conditions', 'search_sources'],
        availabilityPolicy: 'live_optional',
        primaryOutcomeId: fixture.market.outcomes[0]?.id,
        preview: {
          template: fixture.worldManifest.template,
          assetPack: fixture.worldManifest.assetPack,
          regionLabel: 'Meridian Coast',
          tagline: 'Separate launch evidence from correlated reports.',
        },
      },
      fixture,
    });

    expect(definition.scenario.primaryOutcomeId).toBe('yes');
    expect(() =>
      ScenarioDefinitionSchema.parse({
        ...definition,
        scenario: {
          ...definition.scenario,
          requiredCapabilities: ['unbound_capability'],
          preview: { ...definition.scenario.preview, assetPack: 'wrong-pack' },
        },
      }),
    ).toThrow();
  });

  it('rejects object-prototype names at every entity identity boundary', () => {
    const reserved = [
      'constructor',
      'prototype',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      '__proto__',
    ];
    for (const id of reserved) expect(EntityIdSchema.safeParse(id).success).toBe(false);
    expect(EntityIdSchema.parse('signal.constructor-safe')).toBe('signal.constructor-safe');
  });

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
  it('bounds mission work and turn context before either reaches a driver', () => {
    const mission = {
      id: 'mission-bounded',
      expeditionId: 'exp-helios3-demo',
      assignedAgentId: 'mira',
      verb: 'investigate',
      objective: 'Check the bounded fixture.',
      budget: { maxToolCalls: 3, timeoutMs: 30_000 },
      status: 'draft',
      createdBy: { kind: 'player' },
      createdAt: '2027-09-26T18:00:00Z',
    };
    expect(MissionSchema.safeParse(mission).success).toBe(true);
    expect(
      MissionSchema.safeParse({
        ...mission,
        objective: 'x'.repeat(1_001),
        budget: { maxToolCalls: 9, timeoutMs: 120_001 },
      }).success,
    ).toBe(false);
    expect(
      AgentTurnInputSchema.safeParse({
        schemaVersion: 1,
        turnId: 'turn-bounded',
        expeditionId: mission.expeditionId,
        agentId: mission.assignedAgentId,
        mission,
        effectivePlaceId: 'weather-tower',
        attempt: 1,
        knownSourceIds: [],
        knownSignalIds: [],
        allowedCapabilities: [],
        requestedAt: mission.createdAt,
        timeoutMs: 120_001,
      }).success,
    ).toBe(false);
  });

  it('accepts only bounded source-linked current-turn evidence at an allowed place capability', () => {
    const mission = {
      id: 'mission-current-evidence',
      expeditionId: canonicalFixture.expedition.id,
      assignedAgentId: 'mira',
      verb: 'investigate' as const,
      objective: 'Inspect the current bounded source result.',
      destinationPlaceId: 'newsroom',
      budget: { maxToolCalls: 1, timeoutMs: 30_000 },
      status: 'running' as const,
      createdBy: { kind: 'player' as const },
      createdAt: '2027-09-26T18:00:00Z',
      startedAt: '2027-09-26T18:00:01Z',
    };
    const source = structuredClone(canonicalFixture.sources[0]!);
    delete source.structuredData;
    if (source.excerpt) source.excerpt = source.excerpt.slice(0, 1_200);
    const input = {
      schemaVersion: 1 as const,
      turnId: 'turn-current-evidence',
      expeditionId: mission.expeditionId,
      agentId: mission.assignedAgentId,
      mission,
      effectivePlaceId: 'newsroom',
      attempt: 1,
      knownSourceIds: [],
      knownSignalIds: [],
      allowedCapabilities: ['search_sources'],
      currentTurnEvidence: {
        capability: 'search_sources',
        callId: 'pref-current-evidence',
        argumentsHash: 'a'.repeat(64),
        retrievedAt: '2027-09-26T18:00:02Z',
        durationMs: 120,
        cacheStatus: 'miss' as const,
        sources: [source],
        facts: [
          {
            kind: 'article_match',
            sourceIds: [source.id],
            statement: 'The bounded current-turn record reports a relevant update.',
            attributes: { publishedAt: source.publishedAt ?? null },
          },
        ],
      },
      requestedAt: mission.startedAt,
      timeoutMs: mission.budget.timeoutMs,
    };

    expect(AgentTurnInputSchema.safeParse(input).success).toBe(true);
    expect(
      AgentTurnInputSchema.safeParse({
        ...input,
        currentTurnEvidence: {
          ...input.currentTurnEvidence,
          facts: [
            {
              ...input.currentTurnEvidence.facts[0],
              sourceIds: ['src-not-in-packet'],
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      AgentTurnInputSchema.safeParse({
        ...input,
        allowedCapabilities: ['local_conditions'],
      }).success,
    ).toBe(false);
    expect(
      AgentTurnInputSchema.safeParse({
        ...input,
        currentTurnEvidence: {
          ...input.currentTurnEvidence,
          sources: [
            {
              ...source,
              rights: { display: 'metadata_only' as const },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('requires event-stream batches to remain contiguous and expedition-scoped', () => {
    const events = canonicalFixture.initialEvents;
    const valid = {
      schemaVersion: 1,
      type: 'world.events',
      expeditionId: canonicalFixture.expedition.id,
      afterSequence: 0,
      sequence: 2,
      events,
    };
    expect(EventStreamEnvelopeSchema.safeParse(valid).success).toBe(true);

    const gap = structuredClone(valid);
    gap.events[1]!.sequence = 7;
    expect(EventStreamEnvelopeSchema.safeParse(gap).success).toBe(false);

    const wrongExpedition = structuredClone(valid);
    wrongExpedition.events[0]!.expeditionId = 'exp-other';
    expect(EventStreamEnvelopeSchema.safeParse(wrongExpedition).success).toBe(false);

    expect(EventStreamEnvelopeSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
  });

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
