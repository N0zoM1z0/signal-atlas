import { readFileSync } from 'node:fs';

import { WorldEventSchema, type WorldEvent } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  NonContiguousSequenceError,
  UnsupportedEventTypeError,
  UnsupportedEventVersionError,
  WrongExpeditionError,
  canonicalJson,
  createInitialWorldStateFromFixture,
  projectionHash,
  reduceWorldEvent,
  replayFixture,
  replayWorldEvents,
  selectActiveSignals,
  selectLatestForecast,
} from '../src/index.js';
import { fixture } from './helpers.js';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

describe('sequence-zero world projection', () => {
  it('bootstraps the static world while withholding authored information catalog entries', () => {
    const state = createInitialWorldStateFromFixture(fixture);

    expect(state.sequence).toBe(0);
    expect(state.expedition.currentSequence).toBe(0);
    expect(Object.keys(state.agentsById)).toHaveLength(3);
    expect(Object.keys(state.sourcesById)).toHaveLength(0);
    expect(Object.keys(state.claimsById)).toHaveLength(0);
    expect(Object.keys(state.signalsById)).toHaveLength(0);
    expect(selectActiveSignals(state)).toEqual([]);
    expect(fixture.sources).toHaveLength(6);
    expect(fixture.signals).toHaveLength(3);
  });
});

describe('deterministic replay', () => {
  it('replays the supplied initial sequence to the same projection and SHA-256 hash', () => {
    const first = replayFixture(fixture);
    const second = replayFixture(fixture);

    expect(first.projection).toEqual(second.projection);
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toBe(
      'sha256:9962cf353f3b38ccdca94a1a403f53d0710840fd3d4b376ebcddb819023138ab',
    );
    expect(first.projection.sequence).toBe(2);
    expect(first.projection.appliedEventIds).toEqual(['evt-0001', 'evt-0002']);
    expect(selectLatestForecast(first.projection)?.newProbabilities).toEqual({
      yes: 0.55,
      no: 0.45,
    });
    expect(selectActiveSignals(first.projection)).toEqual([]);
  });

  it('ignores a duplicate event ID without changing object identity or applying twice', () => {
    const initial = createInitialWorldStateFromFixture(fixture);
    const firstEvent = fixture.initialEvents[0];
    const secondEvent = fixture.initialEvents[1];
    if (!firstEvent || !secondEvent) {
      throw new Error('Fixture must contain two initial events.');
    }

    const afterFirst = reduceWorldEvent(initial, firstEvent);
    const afterDuplicate = reduceWorldEvent(afterFirst, firstEvent);
    const completed = reduceWorldEvent(afterDuplicate, secondEvent);

    expect(afterDuplicate).toBe(afterFirst);
    expect(completed.appliedEventIds).toEqual(['evt-0001', 'evt-0002']);
    expect(completed.forecasts).toHaveLength(1);
  });

  it('rejects unknown versions, types, expeditions, and sequence gaps explicitly', () => {
    const initial = createInitialWorldStateFromFixture(fixture);
    const firstEvent = fixture.initialEvents[0];
    if (!firstEvent) {
      throw new Error('Fixture must contain an initial event.');
    }

    const badVersion = { ...firstEvent, schemaVersion: 9 } as unknown as WorldEvent;
    expect(() => reduceWorldEvent(initial, badVersion)).toThrow(UnsupportedEventVersionError);
    expect(() => reduceWorldEvent(initial, badVersion)).toThrow('supports version 1');

    const badType = { ...firstEvent, type: 'runtime.magic' } as unknown as WorldEvent;
    expect(() => reduceWorldEvent(initial, badType)).toThrow(UnsupportedEventTypeError);

    const wrongExpedition = {
      ...firstEvent,
      expeditionId: 'exp-somewhere-else',
    } as WorldEvent;
    expect(() => reduceWorldEvent(initial, wrongExpedition)).toThrow(WrongExpeditionError);

    const sequenceGap = { ...firstEvent, sequence: 4 } as WorldEvent;
    expect(() => reduceWorldEvent(initial, sequenceGap)).toThrow(NonContiguousSequenceError);
  });

  it('can replay to an exact earlier sequence and rejects a missing target', () => {
    expect(replayFixture(fixture, 0).projection.sequence).toBe(0);
    expect(replayFixture(fixture, 1).projection.appliedEventIds).toEqual(['evt-0001']);
    expect(() => replayFixture(fixture, 3)).toThrow('target sequence 3 is not present');
  });

  it('does not mutate a deeply frozen bootstrap projection', () => {
    const frozen = deepFreeze(createInitialWorldStateFromFixture(fixture));
    const replayed = replayWorldEvents(frozen, fixture.initialEvents);

    expect(frozen.sequence).toBe(0);
    expect(replayed.sequence).toBe(2);
  });
});

describe('canonical projection hashing', () => {
  it('is independent of object-key insertion order', () => {
    expect(canonicalJson({ beta: 2, alpha: { zed: 3, aye: 1 } })).toBe(
      canonicalJson({ alpha: { aye: 1, zed: 3 }, beta: 2 }),
    );

    const projection = replayFixture(fixture).projection;
    const reversedAgents = Object.fromEntries(Object.entries(projection.agentsById).reverse());
    expect(projectionHash({ ...projection, agentsById: reversedAgents })).toBe(
      projectionHash(projection),
    );
  });

  it('keeps the reducer source free of clock, I/O, and service access', () => {
    const reducerSource = readFileSync(new URL('../src/reducer.ts', import.meta.url), 'utf8');
    expect(reducerSource).not.toMatch(/Date\.now|new Date\s*\(|node:fs|fetch\s*\(|process\./);
  });

  it('handles every contract event variant exactly once', () => {
    const reducerSource = readFileSync(new URL('../src/reducer.ts', import.meta.url), 'utf8');
    const handledTypes = [...reducerSource.matchAll(/^\s+case '([^']+)':/gm)]
      .map((match) => match[1])
      .sort();
    const contractTypes = WorldEventSchema.options.map((option) => option.shape.type.value).sort();

    expect(handledTypes).toEqual(contractTypes);
    expect(new Set(handledTypes).size).toBe(45);
  });
});
