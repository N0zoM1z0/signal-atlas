import { z } from 'zod';

import { EntityIdSchema } from './common.js';
import { WorldEventSchema } from './events.js';

const StreamSequenceSchema = z.number().int().nonnegative();

const WorldEventsEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    type: z.literal('world.events'),
    expeditionId: EntityIdSchema,
    afterSequence: StreamSequenceSchema,
    sequence: StreamSequenceSchema,
    events: z.array(WorldEventSchema).min(1).max(100),
  })
  .superRefine((envelope, context) => {
    envelope.events.forEach((event, index) => {
      const expected = envelope.afterSequence + index + 1;
      if (event.sequence !== expected) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'sequence'],
          message: `Stream event sequence must be contiguous; expected ${expected}.`,
        });
      }
      if (event.expeditionId !== envelope.expeditionId) {
        context.addIssue({
          code: 'custom',
          path: ['events', index, 'expeditionId'],
          message: 'Stream event belongs to a different expedition.',
        });
      }
    });
    const lastSequence = envelope.events.at(-1)?.sequence;
    if (lastSequence !== envelope.sequence) {
      context.addIssue({
        code: 'custom',
        path: ['sequence'],
        message: 'Stream envelope sequence must equal its final event sequence.',
      });
    }
  });

const WorldReadyEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('world.ready'),
  expeditionId: EntityIdSchema,
  sequence: StreamSequenceSchema,
});

const WorldStreamErrorEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal('world.error'),
  expeditionId: EntityIdSchema,
  boundary: z.literal('event_stream'),
  code: z.enum(['invalid_cursor', 'sequence_gap', 'unsupported_client_message']),
  message: z.string().min(1).max(240),
  sequence: StreamSequenceSchema,
});

export const EventStreamEnvelopeSchema = z
  .discriminatedUnion('type', [
    WorldEventsEnvelopeSchema,
    WorldReadyEnvelopeSchema,
    WorldStreamErrorEnvelopeSchema,
  ])
  .meta({
    id: 'https://signal-atlas.local/schemas/event-stream-envelope.schema.json',
    title: 'Signal Atlas Event Stream Envelope',
  });

export function parseEventStreamEnvelope(input: unknown): EventStreamEnvelope {
  return EventStreamEnvelopeSchema.parse(input);
}

export type EventStreamEnvelope = z.infer<typeof EventStreamEnvelopeSchema>;
