import type { ExpeditionFixture, WorldEvent } from '@signal-atlas/contracts';

import { IllegalTransitionError } from './errors.js';
import { projectionHash } from './hash.js';
import { reduceWorldEvent } from './reducer.js';
import { createInitialWorldStateFromFixture, type WorldProjection } from './state.js';

export interface ReplayResult {
  projection: WorldProjection;
  hash: string;
}

export function replayWorldEvents(
  initialState: WorldProjection,
  events: readonly WorldEvent[],
): WorldProjection {
  return events.reduce(reduceWorldEvent, initialState);
}

export function replayWorldEventsWithHash(
  initialState: WorldProjection,
  events: readonly WorldEvent[],
): ReplayResult {
  const projection = replayWorldEvents(initialState, events);
  return { projection, hash: projectionHash(projection) };
}

export function replayFixture(
  fixture: ExpeditionFixture,
  targetSequence = fixture.initialEvents.length,
): ReplayResult {
  if (!Number.isInteger(targetSequence) || targetSequence < 0) {
    throw new IllegalTransitionError('Replay target sequence must be a non-negative integer.');
  }
  const events = fixture.initialEvents.filter((event) => event.sequence <= targetSequence);
  const initialState = createInitialWorldStateFromFixture(fixture);
  const result = replayWorldEventsWithHash(initialState, events);
  if (result.projection.sequence !== targetSequence) {
    throw new IllegalTransitionError(
      `Replay target sequence ${targetSequence} is not present; stopped at ${result.projection.sequence}.`,
    );
  }
  return result;
}
