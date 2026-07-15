import { describe, expect, it } from 'vitest';

import {
  createInitialWorldStateFromFixture,
  recordAcceptedCommand,
  replayFixture,
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
  it('rejects prototype-named identities and stores matching idempotency text safely', () => {
    const state = replayFixture(fixture).projection;
    const reservedIds = [
      'constructor',
      'prototype',
      'toString',
      'valueOf',
      'hasOwnProperty',
      '__proto__',
    ];
    for (const id of reservedIds) {
      const result = validateWorldCommand(
        {
          ...baseCommand,
          id: `cmd-reserved-${id.replaceAll('_', 'x')}`,
          idempotencyKey: `reserved:${id}:forecast`,
          type: 'forecast.commit',
          payload: {
            commit: {
              id: `forecast-reserved-${id.replaceAll('_', 'x')}`,
              expeditionId: fixture.expedition.id,
              actor: { kind: 'player' },
              previousProbabilities: { yes: 0.55, no: 0.45 },
              newProbabilities: { yes: 0.55, no: 0.45 },
              rationale: 'Exercise a hostile inherited-property reference.',
              evidenceSignalIds: [id],
              assumptions: [],
              createdAt: baseCommand.issuedAt,
              commitType: 'hold',
              scoringEligible: true,
            },
          },
        },
        state,
      );
      expect(result).toMatchObject({
        accepted: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: 'invalid_schema' })]),
      });
    }

    const pause = {
      ...baseCommand,
      id: 'cmd-prototype-safe-ledger',
      idempotencyKey: 'constructor',
      type: 'expedition.pause',
      payload: {},
    };
    const accepted = validateWorldCommand(pause, state);
    expect(accepted).toMatchObject({ accepted: true, duplicate: false });
    if (!accepted.accepted) throw new Error('Expected the safe ledger command to pass.');
    const ledger = recordAcceptedCommand({}, accepted.command);
    expect(Object.getPrototypeOf(ledger)).toBeNull();
    expect(Object.hasOwn(ledger, 'constructor')).toBe(true);
    expect(validateWorldCommand(pause, state, ledger)).toMatchObject({
      accepted: true,
      duplicate: true,
    });
  });

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

    const forgedCreator = structuredClone(command);
    forgedCreator.payload.mission.createdBy = { kind: 'system' } as never;
    expect(validateWorldCommand(forgedCreator, state)).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          path: ['payload', 'mission', 'createdBy'],
        }),
      ]),
    });
  });

  it('rejects every new command after expedition finality', () => {
    const state = replayFixture(fixture).projection;
    state.expedition.status = 'resolved';
    state.market.status = 'resolved';
    const commands = [
      {
        ...baseCommand,
        id: 'cmd-final-mission',
        idempotencyKey: 'final:mission:0001',
        type: 'agent.assign_mission',
        payload: {
          mission: {
            id: 'mission-after-finality',
            expeditionId: fixture.expedition.id,
            assignedAgentId: 'mira',
            verb: 'observe_conditions',
            objective: 'This research must not start after resolution.',
            destinationPlaceId: 'weather-tower',
            budget: { maxToolCalls: 1, timeoutMs: 15_000 },
            status: 'draft',
            createdBy: { kind: 'player' },
            createdAt: baseCommand.issuedAt,
          },
        },
      },
      {
        ...baseCommand,
        id: 'cmd-final-meeting',
        idempotencyKey: 'final:meeting:0001',
        type: 'meeting.request',
        payload: {
          meetingId: 'meeting-after-finality',
          placeId: 'square',
          participantAgentIds: ['mira', 'orin'],
        },
      },
      {
        ...baseCommand,
        id: 'cmd-final-professor',
        idempotencyKey: 'final:professor:0001',
        type: 'professor.query',
        payload: {
          query: {
            id: 'query-after-finality',
            expeditionId: fixture.expedition.id,
            mode: 'missing_evidence',
            question: 'Can final history still be rewritten?',
            selectedSourceIds: [],
            selectedSignalIds: [],
            createdAt: baseCommand.issuedAt,
          },
        },
      },
    ];

    for (const command of commands) {
      expect(validateWorldCommand(command, state)).toMatchObject({
        accepted: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_state',
            message: 'Cannot append commands after the expedition is resolved.',
          }),
        ]),
      });
    }
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

  it('rejects skip-travel unless the agent is moving for that mission', () => {
    const state = createInitialWorldStateFromFixture(fixture);
    const result = validateWorldCommand(
      {
        ...baseCommand,
        id: 'cmd-skip-1',
        idempotencyKey: 'skip-mira-travel-0001',
        type: 'agent.skip_travel',
        payload: { agentId: 'mira', missionId: 'mission-missing' },
      },
      state,
    );

    expect(result).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'missing_reference' }),
        expect.objectContaining({ code: 'invalid_state' }),
      ]),
    });
  });

  it('allows an evidence-free hold but rejects an evidence-free revision', () => {
    const state = replayFixture(fixture).projection;
    const hold = {
      ...baseCommand,
      id: 'cmd-forecast-hold-1',
      idempotencyKey: 'forecast:hold:0001',
      type: 'forecast.commit',
      payload: {
        commit: {
          id: 'forecast-hold-1',
          expeditionId: fixture.expedition.id,
          actor: { kind: 'player' },
          previousProbabilities: { yes: 0.55, no: 0.45 },
          newProbabilities: { yes: 0.55, no: 0.45 },
          rationale: 'No new evidence changes the current estimate.',
          evidenceSignalIds: [],
          assumptions: [],
          createdAt: baseCommand.issuedAt,
          commitType: 'hold',
          publicNote: 'Holding at 55% while the team gathers more evidence.',
          scoringEligible: true,
        },
      },
    };

    expect(validateWorldCommand(hold, state)).toMatchObject({ accepted: true });
    expect(
      validateWorldCommand(
        {
          ...hold,
          id: 'cmd-forged-team-forecast',
          idempotencyKey: 'forecast:forged:team:1',
          actor: { kind: 'system' },
          payload: { commit: { ...hold.payload.commit, actor: { kind: 'team' } } },
        },
        state,
      ),
    ).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['payload', 'commit', 'actor'] }),
      ]),
    });
    expect(
      validateWorldCommand(
        {
          ...hold,
          id: 'cmd-forecast-revision-1',
          idempotencyKey: 'forecast:revision:0001',
          payload: {
            commit: {
              ...hold.payload.commit,
              id: 'forecast-revision-1',
              newProbabilities: { yes: 0.48, no: 0.52 },
              commitType: 'revision',
            },
          },
        },
        state,
      ),
    ).toMatchObject({
      accepted: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference',
          message: 'A forecast revision requires at least one linked signal.',
        }),
      ]),
    });
  });
});
