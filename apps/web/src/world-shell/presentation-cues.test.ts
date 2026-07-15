import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { replayFixture } from '@signal-atlas/simulation';
import { describe, expect, it } from 'vitest';

import { presentationCuesForEvents } from './presentation-cues.js';

describe('authoritative presentation cues', () => {
  it('maps only committed choreography events and preserves their order', () => {
    const fixture = createHelios3ExpeditionFixture();
    const projection = replayFixture(fixture).projection;
    const cues = presentationCuesForEvents(fixture.initialEvents, projection);

    expect(cues).toEqual([]);
    expect(
      presentationCuesForEvents(
        [
          {
            id: 'evt-test-dialogue',
            expeditionId: fixture.expedition.id,
            sequence: 3,
            type: 'agent.dialogue.emitted',
            occurredAt: '2027-09-26T18:32:00Z',
            recordedAt: '2027-09-26T18:32:00Z',
            actor: { kind: 'system' },
            correlationId: 'mission-test',
            schemaVersion: 1,
            payload: {
              agentId: 'mira',
              text: 'Evidence is bounded.',
              sourceIds: [],
              signalIds: [],
            },
          },
        ],
        projection,
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'cue-evt-test-dialogue',
        kind: 'work',
        sequence: 3,
        text: 'Mira: Evidence is bounded.',
      }),
    ]);
  });
});
