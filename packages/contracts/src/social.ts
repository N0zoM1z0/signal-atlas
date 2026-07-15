import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  MissionVerbSchema,
  ProfessorModeSchema,
} from './common.js';

export const MAX_PROFESSOR_QUESTION_LENGTH = 1_200;
export const MAX_PROFESSOR_ANSWER_LENGTH = 2_000;
export const MAX_PROFESSOR_NOTE_LENGTH = 500;
export const MAX_PROFESSOR_NOTES = 8;

export const MissionProposalSchema = z.strictObject({
  agentId: EntityIdSchema.optional(),
  verb: MissionVerbSchema,
  objective: z.string().min(1).max(1_000),
  destinationPlaceId: EntityIdSchema.optional(),
});

export const MeetingMemoSchema = z.strictObject({
  summary: z.string().min(1),
  agreements: z.array(z.string().min(1)),
  disagreements: z.array(z.string().min(1)),
  followUpMissionProposals: z.array(MissionProposalSchema),
});

export const MeetingSchema = z
  .strictObject({
    id: EntityIdSchema,
    expeditionId: EntityIdSchema,
    placeId: EntityIdSchema,
    participantAgentIds: z.array(EntityIdSchema).min(2),
    startedAt: DateTimeSchema,
    endedAt: DateTimeSchema.optional(),
    sharedSignalIds: z.array(EntityIdSchema),
    disagreementTypes: z.array(z.enum(['evidence', 'model', 'prior'])),
    memo: MeetingMemoSchema.optional(),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/meeting.schema.json',
    title: 'Signal Atlas Meeting',
  });

export const ProfessorQuerySchema = z
  .strictObject({
    id: EntityIdSchema,
    expeditionId: EntityIdSchema,
    mode: ProfessorModeSchema,
    question: z.string().min(1).max(MAX_PROFESSOR_QUESTION_LENGTH),
    selectedSourceIds: z.array(EntityIdSchema).max(256),
    selectedSignalIds: z.array(EntityIdSchema).max(256),
    createdAt: DateTimeSchema,
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/professor-query.schema.json',
    title: 'Signal Atlas Professor Query',
  });

export const ProfessorEvidenceSchema = z.strictObject({
  type: z.enum(['source', 'signal']),
  id: EntityIdSchema,
});

export const ProfessorModelResponseSchema = z.strictObject({
  queryId: EntityIdSchema,
  mode: ProfessorModeSchema.optional(),
  selectedSignalIds: z.array(EntityIdSchema).max(256).optional(),
  answer: z.string().min(1).max(MAX_PROFESSOR_ANSWER_LENGTH),
  evidenceUsed: z.array(ProfessorEvidenceSchema).max(512),
  assumptions: z.array(z.string().min(1).max(MAX_PROFESSOR_NOTE_LENGTH)).max(MAX_PROFESSOR_NOTES),
  limitations: z.array(z.string().min(1).max(MAX_PROFESSOR_NOTE_LENGTH)).max(MAX_PROFESSOR_NOTES),
  suggestedNextQuestion: z.string().min(1).max(MAX_PROFESSOR_QUESTION_LENGTH).optional(),
  suggestedMission: MissionProposalSchema.omit({ agentId: true }).optional(),
});

export const ProfessorRuntimeSchema = z.strictObject({
  mode: z.enum(['scripted', 'local_exec', 'scripted_fallback']),
  driverId: EntityIdSchema,
  durationMs: z.number().int().nonnegative(),
  repairAttempts: z.number().int().min(0).max(1),
  fallbackReason: z.string().min(1).max(160).optional(),
});

export const ProfessorResponseSchema = ProfessorModelResponseSchema.extend({
  runtime: ProfessorRuntimeSchema.optional(),
}).meta({
  id: 'https://signal-atlas.local/schemas/professor-response.schema.json',
  title: 'Signal Atlas Professor Response',
});

export type MissionProposal = z.infer<typeof MissionProposalSchema>;
export type MeetingMemo = z.infer<typeof MeetingMemoSchema>;
export type Meeting = z.infer<typeof MeetingSchema>;
export type ProfessorQuery = z.infer<typeof ProfessorQuerySchema>;
export type ProfessorModelResponse = z.infer<typeof ProfessorModelResponseSchema>;
export type ProfessorRuntime = z.infer<typeof ProfessorRuntimeSchema>;
export type ProfessorResponse = z.infer<typeof ProfessorResponseSchema>;
