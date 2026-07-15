import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { parseWorldProjection, replayFixture } from '../src/index.js';

describe('world projection runtime schema', () => {
  it('parses the complete fixture projection', () => {
    const fixture = createHelios3ExpeditionFixture();
    const projection = replayFixture(fixture).projection;

    expect(parseWorldProjection(projection)).toEqual(projection);
  });

  it('rejects object-like but incomplete entity containers', () => {
    expect(() =>
      parseWorldProjection({
        projectionSchemaVersion: 1,
        sequence: 999,
        expedition: { id: 'exp-helios3-demo' },
        agentsById: [],
        worldManifest: {},
      }),
    ).toThrow();
  });

  it('rejects prototype keys instead of silently dropping knowledge edges', () => {
    const fixture = createHelios3ExpeditionFixture();
    const projection = replayFixture(fixture).projection;
    const validEdge = {
      agentId: 'mira',
      objectType: 'source',
      objectId: 'src-prototype-test',
      acquiredAt: '2027-09-26T18:01:00Z',
      acquisition: { kind: 'system', reason: 'Boundary test' },
      eventId: 'evt-prototype-test',
      sequence: projection.sequence,
    };
    const prototypeKey = JSON.parse(`{"__proto__":${JSON.stringify(validEdge)}}`) as Record<
      string,
      unknown
    >;

    expect(() => parseWorldProjection({ ...projection, knowledgeByKey: prototypeKey })).toThrow();
  });
});
