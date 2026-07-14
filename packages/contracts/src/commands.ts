import { z } from 'zod';

import { DateTimeSchema, EntityIdSchema, SCHEMA_VERSION, SimulationSpeedSchema } from './common.js';
import { ForecastCommitSchema, MissionSchema } from './agents.js';
import { ProfessorQuerySchema } from './social.js';

export const CommandActorSchema = z.strictObject({
  kind: z.enum(['player', 'agent', 'system']),
  id: EntityIdSchema.optional(),
});

const commandEnvelope = {
  id: EntityIdSchema,
  idempotencyKey: z.string().min(8).max(200),
  expeditionId: EntityIdSchema,
  issuedAt: DateTimeSchema,
  actor: CommandActorSchema,
  schemaVersion: z.literal(SCHEMA_VERSION),
};

function commandVariant<const TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return z.strictObject({
    ...commandEnvelope,
    type: z.literal(type),
    payload,
  });
}

export const ExpeditionStartCommandSchema = commandVariant('expedition.start', z.strictObject({}));
export const ExpeditionPauseCommandSchema = commandVariant(
  'expedition.pause',
  z.strictObject({ reason: z.string().min(1).optional() }),
);
export const ExpeditionSpeedChangeCommandSchema = commandVariant(
  'expedition.change_speed',
  z.strictObject({ speed: SimulationSpeedSchema }),
);
export const MissionAssignCommandSchema = commandVariant(
  'agent.assign_mission',
  z.strictObject({ mission: MissionSchema }),
);
export const MissionCancelCommandSchema = commandVariant(
  'agent.cancel_mission',
  z.strictObject({ missionId: EntityIdSchema, reason: z.string().min(1).optional() }),
);
export const MissionReorderCommandSchema = commandVariant(
  'agent.reorder_missions',
  z.strictObject({ agentId: EntityIdSchema, orderedMissionIds: z.array(EntityIdSchema) }),
);
export const MeetingRequestCommandSchema = commandVariant(
  'meeting.request',
  z.strictObject({
    meetingId: EntityIdSchema,
    placeId: EntityIdSchema,
    participantAgentIds: z.array(EntityIdSchema).min(2),
  }),
);
export const ProfessorQueryCommandSchema = commandVariant(
  'professor.query',
  z.strictObject({ query: ProfessorQuerySchema }),
);
export const ForecastCommitCommandSchema = commandVariant(
  'forecast.commit',
  z.strictObject({ commit: ForecastCommitSchema }),
);
export const RuntimeRetryCommandSchema = commandVariant(
  'runtime.retry_turn',
  z.strictObject({
    agentId: EntityIdSchema,
    missionId: EntityIdSchema,
    failedTurnId: EntityIdSchema,
  }),
);

export const WorldCommandSchema = z
  .discriminatedUnion('type', [
    ExpeditionStartCommandSchema,
    ExpeditionPauseCommandSchema,
    ExpeditionSpeedChangeCommandSchema,
    MissionAssignCommandSchema,
    MissionCancelCommandSchema,
    MissionReorderCommandSchema,
    MeetingRequestCommandSchema,
    ProfessorQueryCommandSchema,
    ForecastCommitCommandSchema,
    RuntimeRetryCommandSchema,
  ])
  .meta({
    id: 'https://signal-atlas.local/schemas/world-command.schema.json',
    title: 'Signal Atlas World Command',
  });

export function parseWorldCommand(input: unknown): WorldCommand {
  return WorldCommandSchema.parse(input);
}

export type WorldCommand = z.infer<typeof WorldCommandSchema>;
