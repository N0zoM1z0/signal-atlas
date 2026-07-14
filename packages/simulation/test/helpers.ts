import { WorldEventSchema, type WorldEvent } from '@signal-atlas/contracts';
import { helios3ExpeditionFixture } from '@signal-atlas/test-fixtures';

export const fixture = helios3ExpeditionFixture;

type WorldEventBody = WorldEvent extends infer TEvent
  ? TEvent extends WorldEvent
    ? Pick<TEvent, 'type' | 'payload'>
    : never
  : never;

export function makeEvent(sequence: number, body: WorldEventBody): WorldEvent {
  const timestamp = `2027-09-26T18:${String(sequence).padStart(2, '0')}:00Z`;
  return WorldEventSchema.parse({
    id: `evt-test-${String(sequence).padStart(4, '0')}`,
    expeditionId: fixture.expedition.id,
    sequence,
    occurredAt: timestamp,
    recordedAt: timestamp,
    actor: { kind: 'system' },
    schemaVersion: 1,
    ...body,
  });
}
