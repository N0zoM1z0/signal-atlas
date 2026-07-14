import { describe, expect, it } from 'vitest';

import {
  createInitialWorldStateFromFixture,
  recordAcceptedCommand,
  validateWorldCommand,
} from '../src/index.js';
import { fixture } from './helpers.js';

const baseCommand = {
  id: 'cmd-pause-1',
  idempotencyKey: 'pause-expedition-0001',
  expeditionId: fixture.expedition.id,
  issuedAt: '2027-09-26T18:10:00Z',
  actor: { kind: 'player' as const },
  schemaVersion: 1 as const,
};

describe('pure command validation', () => {
  it('accepts a legal command and recognizes an idempotent retry', () => {
    const state = createInitialWorldStateFromFixture(fixture);
    const input = { ...baseCommand, type: 'expedition.pause', payload: {} };
    const first = validateWorldCommand(input, state);

    expect(first).toMatchObject({ accepted: true, duplicate: false });
    if (!first.accepted) {
      throw new Error('Pause command should be accepted.');
    }
    const ledger = recordAcceptedCommand({}, first.command);
    expect(validateWorldCommand(input, state, ledger)).toMatchObject({
      accepted: true,
      duplicate: true,
    });
    expect(
      validateWorldCommand(
        { ...input, payload: { reason: 'Changed retry payload.' } },
        state,
        ledger,
      ),
    ).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'idempotency_conflict' })]),
    });
  });

  it('reports schema, idempotency, expedition, and state errors without throwing', () => {
    const state = createInitialWorldStateFromFixture(fixture);
    const invalidSchema = validateWorldCommand(
      { ...baseCommand, idempotencyKey: 'short', type: 'expedition.pause', payload: {} },
      state,
    );
    expect(invalidSchema).toMatchObject({
      accepted: false,
      issues: [{ code: 'invalid_schema' }],
    });

    const invalidState = validateWorldCommand(
      { ...baseCommand, id: 'cmd-start-1', type: 'expedition.start', payload: {} },
      state,
    );
    expect(invalidState).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'invalid_state' })]),
    });

    const wrongExpedition = validateWorldCommand(
      {
        ...baseCommand,
        expeditionId: 'exp-unknown',
        type: 'expedition.pause',
        payload: {},
      },
      state,
    );
    expect(wrongExpedition).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'wrong_expedition' })]),
    });

    const acceptedPause = validateWorldCommand(
      { ...baseCommand, type: 'expedition.pause', payload: {} },
      state,
    );
    if (!acceptedPause.accepted) {
      throw new Error('Baseline pause command should be accepted.');
    }
    const conflict = validateWorldCommand(
      { ...baseCommand, id: 'cmd-pause-conflict', type: 'expedition.pause', payload: {} },
      state,
      recordAcceptedCommand({}, acceptedPause.command),
    );
    expect(conflict).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'idempotency_conflict' })]),
    });
  });

  it('validates mission world references and location capabilities', () => {
    const state = createInitialWorldStateFromFixture(fixture);
    const mission = {
      id: 'mission-weather-check',
      expeditionId: fixture.expedition.id,
      assignedAgentId: 'mira',
      verb: 'observe_conditions' as const,
      objective: 'Observe current crosswind conditions.',
      destinationPlaceId: 'weather-tower',
      budget: { maxToolCalls: 1, timeoutMs: 15_000 },
      status: 'draft' as const,
      createdBy: { kind: 'player' as const },
      createdAt: '2027-09-26T18:10:00Z',
    };
    const command = {
      ...baseCommand,
      id: 'cmd-mission-1',
      idempotencyKey: 'assign-weather-mission-1',
      type: 'agent.assign_mission',
      payload: { mission },
    };
    expect(validateWorldCommand(command, state)).toMatchObject({
      accepted: true,
      duplicate: false,
    });

    const unsupportedPlace = structuredClone(command);
    unsupportedPlace.payload.mission.destinationPlaceId = 'archive';
    const unsupportedResult = validateWorldCommand(unsupportedPlace, state);
    expect(unsupportedResult).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          message: expect.stringContaining('does not support'),
        }),
      ]),
    });

    const missingAgent = structuredClone(command);
    missingAgent.payload.mission.assignedAgentId = 'unknown-agent';
    expect(validateWorldCommand(missingAgent, state)).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: 'missing_reference' })]),
    });
  });

  it('rejects duplicate meeting participants', () => {
    const state = createInitialWorldStateFromFixture(fixture);
    const result = validateWorldCommand(
      {
        ...baseCommand,
        id: 'cmd-meeting-1',
        idempotencyKey: 'request-meeting-0001',
        type: 'meeting.request',
        payload: {
          meetingId: 'meeting-1',
          placeId: 'square',
          participantAgentIds: ['mira', 'mira'],
        },
      },
      state,
    );

    expect(result).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          message: 'Meeting participants must be unique.',
        }),
      ]),
    });
  });
});
