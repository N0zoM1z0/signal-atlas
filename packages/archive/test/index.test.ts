import { parseWorldEvent, SCHEMA_VERSION, type WorldEvent } from '@signal-atlas/contracts';
import { projectionHash, replayFixture, replayWorldEvents } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  createArchiveIndex,
  createCaseFileTurningPoints,
  createSignalAtlasCaseFile,
  publicProjectionHash,
  searchArchive,
} from '../src/index.js';

function evidenceState() {
  const fixture = createHelios3ExpeditionFixture();
  const projection = replayFixture(fixture).projection;
  projection.sourcesById = Object.fromEntries(fixture.sources.map((source) => [source.id, source]));
  projection.claimsById = Object.fromEntries(fixture.claims.map((claim) => [claim.id, claim]));
  projection.signalsById = Object.fromEntries(fixture.signals.map((signal) => [signal.id, signal]));
  const orin = projection.agentsById['orin'];
  if (orin) {
    orin.knownSourceIds = ['src-archive-crosswind-1'];
    orin.knownSignalIds = ['sig-base-rate'];
  }
  const envelope = {
    expeditionId: fixture.expedition.id,
    occurredAt: '2027-09-26T18:34:00Z',
    recordedAt: '2027-09-26T18:34:00Z',
    actor: { kind: 'system' as const },
    schemaVersion: SCHEMA_VERSION,
  };
  const events: WorldEvent[] = [
    parseWorldEvent({
      ...envelope,
      id: 'evt-archive-source-introduced',
      sequence: 3,
      type: 'source.recorded',
      payload: {
        source: fixture.sources.find((source) => source.id === 'src-archive-crosswind-1'),
      },
    }),
    parseWorldEvent({
      ...envelope,
      id: 'evt-archive-signal-introduced',
      sequence: 5,
      type: 'signal.created',
      payload: { signal: fixture.signals.find((signal) => signal.id === 'sig-base-rate') },
    }),
  ];
  return { fixture, projection, events };
}

describe('local archive index', () => {
  it('searches by text, kind, date, place, class, and agent deterministically', () => {
    const { projection, events } = evidenceState();
    const index = createArchiveIndex(projection, events);

    expect(
      searchArchive(index, { text: 'eight twenty comparable' }).map((entry) => entry.archiveId),
    ).toEqual(expect.arrayContaining(['source:src-archive-crosswind-1', 'signal:sig-base-rate']));
    expect(
      searchArchive(index, {
        kind: 'signal',
        dateFrom: '2027-08-01',
        dateTo: '2027-09-30',
        placeId: 'weather-tower',
        sourceClass: 'archive',
        agentId: 'orin',
      }).map((entry) => entry.archiveId),
    ).toEqual(['signal:sig-base-rate']);
    expect(index.entries.find((entry) => entry.archiveId === 'signal:sig-base-rate')).toMatchObject(
      {
        entrySequence: 5,
        enteredAt: '2027-09-26T18:34:00Z',
      },
    );
  });

  it('retains both sides of a supersession chain for inspection', () => {
    const { fixture, projection } = evidenceState();
    const template = fixture.sources[0];
    if (!template) throw new Error('Expected a source template.');
    projection.sourcesById['src-old-version'] = {
      ...structuredClone(template),
      id: 'src-old-version',
      title: 'Older advisory version',
    };
    projection.sourcesById['src-new-version'] = {
      ...structuredClone(template),
      id: 'src-new-version',
      title: 'Newer advisory version',
      supersedesSourceId: 'src-old-version',
    };

    const index = createArchiveIndex(projection);

    expect(
      index.entries.find((entry) => entry.archiveId === 'source:src-old-version'),
    ).toMatchObject({
      status: 'superseded',
      supersededBySourceId: 'src-new-version',
    });
    expect(
      index.entries.find((entry) => entry.archiveId === 'source:src-new-version'),
    ).toMatchObject({
      status: 'current',
    });
  });
});

describe('resolved case files', () => {
  it('derives source entry markers from events rather than entity timestamps', () => {
    const { projection, events } = evidenceState();

    const markers = createCaseFileTurningPoints(projection, events);

    expect(markers).toEqual([
      expect.objectContaining({
        sequence: 3,
        eventId: 'evt-archive-source-introduced',
        kind: 'source',
        entityId: 'src-archive-crosswind-1',
      }),
      expect.objectContaining({
        sequence: 5,
        eventId: 'evt-archive-signal-introduced',
        kind: 'signal',
        entityId: 'sig-base-rate',
      }),
    ]);
  });

  it('exports distinct provenance sections without leaking a private forecast memo', () => {
    const fixture = createHelios3ExpeditionFixture();
    const initial = replayFixture(fixture).projection;
    const envelope = {
      expeditionId: fixture.expedition.id,
      recordedAt: '2027-09-30T23:59:59Z',
      actor: { kind: 'system' as const },
      schemaVersion: SCHEMA_VERSION,
      correlationId: 'fixture-resolution:exp-helios3-demo',
    };
    const events: WorldEvent[] = [
      parseWorldEvent({
        ...envelope,
        id: 'evt-case-forecast',
        sequence: 3,
        type: 'forecast.committed',
        occurredAt: '2027-09-26T18:42:00Z',
        actor: { kind: 'player' },
        payload: {
          commitId: 'forecast-case-1',
          actor: { kind: 'player' },
          previousProbabilities: { yes: 0.55, no: 0.45 },
          newProbabilities: { yes: 0.48, no: 0.52 },
          rationale: 'Public evidence rationale.',
          evidenceSignalIds: [],
          assumptions: [],
          publicNote: 'Public note.',
          privateMemo: 'Never export this note.',
          scoringEligible: true,
        },
      }),
      parseWorldEvent({
        ...envelope,
        id: 'evt-case-market-resolved',
        sequence: 4,
        type: 'market.resolved',
        occurredAt: fixture.resolutionFixture.resolvedAt,
        payload: {
          resolvedOutcomeId: fixture.resolutionFixture.resolvedOutcomeId,
          resolvedAt: fixture.resolutionFixture.resolvedAt,
          resolutionNote: fixture.resolutionFixture.resolutionNote,
        },
      }),
      parseWorldEvent({
        ...envelope,
        id: 'evt-case-score',
        sequence: 5,
        type: 'score.calculated',
        occurredAt: fixture.resolutionFixture.resolvedAt,
        payload: {
          forecastCommitId: 'evt-case-forecast',
          brierScore: 0.4608,
          components: { yes: 0.2304, no: 0.2304 },
        },
      }),
      parseWorldEvent({
        ...envelope,
        id: 'evt-case-expedition-resolved',
        sequence: 6,
        type: 'expedition.resolved',
        occurredAt: fixture.resolutionFixture.resolvedAt,
        payload: {
          resolvedOutcomeId: fixture.resolutionFixture.resolvedOutcomeId,
          resolvedAt: fixture.resolutionFixture.resolvedAt,
        },
      }),
    ];
    const projection = replayWorldEvents(initial, events);
    const privateHash = projectionHash(projection);
    const hash = publicProjectionHash(projection);

    const exported = createSignalAtlasCaseFile(projection, [...fixture.initialEvents, ...events]);

    expect(exported).toMatchObject({
      schemaVersion: 1,
      kind: 'signal-atlas.case-file',
      recordedThroughSequence: 6,
      finalProjectionHash: hash,
      resolution: { outcomeId: 'no', marketEventId: 'evt-case-market-resolved' },
      sources: [],
      claims: [],
      signals: [],
      forecastRationales: expect.arrayContaining([
        expect.objectContaining({
          forecastId: 'evt-case-forecast',
          commitId: 'forecast-case-1',
          rationale: 'Public evidence rationale.',
          score: expect.objectContaining({ brierScore: 0.4608 }),
        }),
      ]),
      turningPoints: expect.arrayContaining([
        expect.objectContaining({ kind: 'forecast', sequence: 3 }),
        expect.objectContaining({ kind: 'resolution', sequence: 4 }),
        expect.objectContaining({ kind: 'score', sequence: 5 }),
      ]),
    });
    expect(JSON.stringify(exported)).not.toContain('Never export this note.');
    expect(exported.finalProjectionHash).not.toBe(privateHash);
    expect(exported.events.find((event) => event.id === 'evt-case-forecast')).not.toHaveProperty(
      'payload.privateMemo',
    );

    const replayedPublicProjection = replayWorldEvents(
      initial,
      exported.events.filter((event) => event.sequence > initial.sequence),
    );
    expect(projectionHash(replayedPublicProjection)).toBe(exported.finalProjectionHash);

    const changedPrivateEvents = events.map((event) => {
      if (event.type !== 'forecast.committed') return event;
      return parseWorldEvent({
        ...structuredClone(event),
        payload: { ...event.payload, privateMemo: 'A completely different private note.' },
      });
    });
    const changedPrivateProjection = replayWorldEvents(initial, changedPrivateEvents);
    const changedPrivateExport = createSignalAtlasCaseFile(changedPrivateProjection, [
      ...fixture.initialEvents,
      ...changedPrivateEvents,
    ]);
    expect(changedPrivateExport.finalProjectionHash).toBe(exported.finalProjectionHash);
  });
});
