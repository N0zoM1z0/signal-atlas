import { MAX_MISSION_OBJECTIVE_LENGTH } from '../src/agents.js';

const entityId = {
  type: 'string',
  minLength: 1,
  maxLength: 160,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._:-]*$',
} as const;

const nullableEntityId = { anyOf: [{ $ref: '#/$defs/entityId' }, { type: 'null' }] } as const;

/**
 * Strict transport projection for Codex Structured Outputs.
 *
 * Every object property is required by that transport. Domain-optionals are represented as null
 * here and normalized back to omitted properties before AgentTurnOutputSchema parses the result.
 * The canonical Zod-generated schema remains schemas/agent-turn-output.schema.json.
 */
export const codexAgentTurnOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    agentId: { $ref: '#/$defs/entityId' },
    missionId: { $ref: '#/$defs/entityId' },
    action: { $ref: '#/$defs/action' },
    publicDialogue: { type: 'string', minLength: 1, maxLength: 400 },
    sourceIdsUsed: { type: 'array', items: { $ref: '#/$defs/entityId' } },
    proposedClaims: { type: 'array', items: { $ref: '#/$defs/proposedClaim' } },
    proposedSignals: { type: 'array', items: { $ref: '#/$defs/proposedSignal' } },
    rationale: { type: 'string', minLength: 1, maxLength: 320 },
    assumptions: { type: 'array', items: { type: 'string', minLength: 1 } },
    unknowns: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      maxItems: 6,
    },
    suggestedFollowUp: {
      anyOf: [{ $ref: '#/$defs/suggestedFollowUp' }, { type: 'null' }],
    },
  },
  required: [
    'schemaVersion',
    'agentId',
    'missionId',
    'action',
    'publicDialogue',
    'sourceIdsUsed',
    'proposedClaims',
    'proposedSignals',
    'rationale',
    'assumptions',
    'unknowns',
    'suggestedFollowUp',
  ],
  $defs: {
    entityId,
    probability: { type: 'number', minimum: 0, maximum: 1 },
    probabilityRange: {
      type: 'object',
      additionalProperties: false,
      properties: {
        low: { $ref: '#/$defs/probability' },
        high: { $ref: '#/$defs/probability' },
      },
      required: ['low', 'high'],
    },
    probabilityDistribution: {
      type: 'object',
      additionalProperties: false,
      properties: {
        yes: { $ref: '#/$defs/probability' },
        no: { $ref: '#/$defs/probability' },
      },
      required: ['yes', 'no'],
    },
    uncertainty: {
      type: 'object',
      additionalProperties: false,
      properties: {
        yes: { $ref: '#/$defs/probabilityRange' },
        no: { $ref: '#/$defs/probabilityRange' },
      },
      required: ['yes', 'no'],
    },
    action: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'wait' },
            reason: { type: 'string', minLength: 1 },
          },
          required: ['type', 'reason'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'move' },
            destinationPlaceId: { $ref: '#/$defs/entityId' },
          },
          required: ['type', 'destinationPlaceId'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'investigate' },
            capability: { type: 'string', minLength: 1 },
            query: { type: 'string', minLength: 1 },
          },
          required: ['type', 'capability', 'query'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'share_signal' },
            targetAgentId: { $ref: '#/$defs/entityId' },
            signalIds: { type: 'array', minItems: 1, items: { $ref: '#/$defs/entityId' } },
          },
          required: ['type', 'targetAgentId', 'signalIds'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'request_mission' },
            verb: { $ref: '#/$defs/missionVerb' },
            objective: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_MISSION_OBJECTIVE_LENGTH,
            },
            destinationPlaceId: nullableEntityId,
          },
          required: ['type', 'verb', 'objective', 'destinationPlaceId'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', const: 'update_belief' },
            probabilities: { $ref: '#/$defs/probabilityDistribution' },
            uncertainty: { anyOf: [{ $ref: '#/$defs/uncertainty' }, { type: 'null' }] },
          },
          required: ['type', 'probabilities', 'uncertainty'],
        },
      ],
    },
    missionVerb: {
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
    proposedClaim: {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', minLength: 1 },
        sourceIds: { type: 'array', minItems: 1, items: { $ref: '#/$defs/entityId' } },
        qualifiers: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
      required: ['text', 'sourceIds', 'qualifiers'],
    },
    proposedSignal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        headline: { type: 'string', minLength: 1 },
        summary: { type: 'string', minLength: 1 },
        claimIndexes: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } },
        sourceIds: { type: 'array', minItems: 1, items: { $ref: '#/$defs/entityId' } },
        direction: {
          type: 'string',
          enum: ['supports_outcome', 'opposes_outcome', 'context'],
        },
        targetOutcomeId: nullableEntityId,
        impactLabel: { type: 'string', enum: ['small', 'medium', 'large', 'unknown'] },
      },
      required: [
        'headline',
        'summary',
        'claimIndexes',
        'sourceIds',
        'direction',
        'targetOutcomeId',
        'impactLabel',
      ],
    },
    suggestedFollowUp: {
      type: 'object',
      additionalProperties: false,
      properties: {
        verb: { $ref: '#/$defs/missionVerb' },
        objective: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_MISSION_OBJECTIVE_LENGTH,
        },
        destinationPlaceId: nullableEntityId,
      },
      required: ['verb', 'objective', 'destinationPlaceId'],
    },
  },
} as const;
