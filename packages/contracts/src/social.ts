import { z } from 'zod';

import {
  DateTimeSchema,
  EntityIdSchema,
  MissionVerbSchema,
  ProfessorModeSchema,
} from './common.js';

export const MissionProposalSchema = z.strictObject({
  agentId: EntityIdSchema.optional(),
  verb: MissionVerbSchema,
  objective: z.string().min(1),
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
    question: z.string().min(1),
    selectedSourceIds: z.array(EntityIdSchema),
    selectedSignalIds: z.array(EntityIdSchema),
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

export const ProfessorResponseSchema = z
  .strictObject({
    queryId: EntityIdSchema,
    mode: ProfessorModeSchema.optional(),
    selectedSignalIds: z.array(EntityIdSchema).optional(),
    answer: z.string().min(1),
    evidenceUsed: z.array(ProfessorEvidenceSchema),
    assumptions: z.array(z.string().min(1)),
    limitations: z.array(z.string().min(1)),
    suggestedNextQuestion: z.string().min(1).optional(),
    suggestedMission: MissionProposalSchema.omit({ agentId: true }).optional(),
  })
  .meta({
    id: 'https://signal-atlas.local/schemas/professor-response.schema.json',
    title: 'Signal Atlas Professor Response',
  });

export type MissionProposal = z.infer<typeof MissionProposalSchema>;
export type MeetingMemo = z.infer<typeof MeetingMemoSchema>;
export type Meeting = z.infer<typeof MeetingSchema>;
export type ProfessorQuery = z.infer<typeof ProfessorQuerySchema>;
export type ProfessorResponse = z.infer<typeof ProfessorResponseSchema>;
