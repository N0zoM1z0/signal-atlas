import {
  MAX_PROFESSOR_ANSWER_LENGTH,
  MAX_PROFESSOR_NOTE_LENGTH,
  MAX_PROFESSOR_NOTES,
  MAX_PROFESSOR_QUESTION_LENGTH,
} from '../src/social.js';

const entityId = {
  type: 'string',
  minLength: 1,
  maxLength: 160,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$',
} as const;

const nullableEntityId = { anyOf: [{ $ref: '#/$defs/entityId' }, { type: 'null' }] } as const;

const professorMode = {
  type: 'string',
  enum: [
    'explain',
    'challenge',
    'compare',
    'base_rate',
    'missing_evidence',
    'correlation_check',
    'forecast_impact',
  ],
} as const;

/**
 * Strict transport projection for a bounded Professor Codex turn.
 *
 * Structured Outputs requires every property to be present. Domain optionals use null here and
 * are normalized before ProfessorModelResponseSchema validates the canonical response.
 */
export const codexProfessorResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    queryId: { $ref: '#/$defs/entityId' },
    mode: { $ref: '#/$defs/professorMode' },
    selectedSignalIds: {
      type: 'array',
      maxItems: 256,
      items: { $ref: '#/$defs/entityId' },
    },
    answer: { type: 'string', minLength: 1, maxLength: MAX_PROFESSOR_ANSWER_LENGTH },
    evidenceUsed: {
      type: 'array',
      maxItems: 512,
      items: { $ref: '#/$defs/evidence' },
    },
    assumptions: {
      type: 'array',
      maxItems: MAX_PROFESSOR_NOTES,
      items: { type: 'string', minLength: 1, maxLength: MAX_PROFESSOR_NOTE_LENGTH },
    },
    limitations: {
      type: 'array',
      maxItems: MAX_PROFESSOR_NOTES,
      items: { type: 'string', minLength: 1, maxLength: MAX_PROFESSOR_NOTE_LENGTH },
    },
    suggestedNextQuestion: {
      anyOf: [
        { type: 'string', minLength: 1, maxLength: MAX_PROFESSOR_QUESTION_LENGTH },
        { type: 'null' },
      ],
    },
    suggestedMission: {
      anyOf: [{ $ref: '#/$defs/missionProposal' }, { type: 'null' }],
    },
  },
  required: [
    'queryId',
    'mode',
    'selectedSignalIds',
    'answer',
    'evidenceUsed',
    'assumptions',
    'limitations',
    'suggestedNextQuestion',
    'suggestedMission',
  ],
  $defs: {
    entityId,
    professorMode,
    evidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['source', 'signal'] },
        id: { $ref: '#/$defs/entityId' },
      },
      required: ['type', 'id'],
    },
    missionProposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        verb: {
          type: 'string',
          enum: [
            'investigate',
            'verify',
            'search_history',
            'find_contradiction',
            'compare_sources',
            'observe_conditions',
            'meet_agent',
            'deliver_signal',
            'reassess_forecast',
            'consult_professor',
          ],
        },
        objective: { type: 'string', minLength: 1, maxLength: 1_000 },
        destinationPlaceId: nullableEntityId,
      },
      required: ['verb', 'objective', 'destinationPlaceId'],
    },
  },
} as const;
