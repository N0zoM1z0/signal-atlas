import { parseWorldEvent, SCHEMA_VERSION, type WorldEvent } from '@signal-atlas/contracts';
import { replayFixture } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createArchiveIndex, searchArchive } from '../src/index.js';

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
