import type { Mission } from '@signal-atlas/contracts';
import { describe, expect, it } from 'vitest';

import {
  IllegalTransitionError,
  createInitialWorldStateFromFixture,
  reduceWorldEvent,
  replayWorldEvents,
  selectActiveSignals,
  selectAgents,
  selectAgentsKnowing,
  selectKnowledgeDistribution,
  selectPlaces,
} from '../src/index.js';
import { fixture, makeEvent } from './helpers.js';

describe('information and explicit knowledge projection', () => {
  it('uses own-property indexes and never resolves inherited prototype names', () => {
    const initial = createInitialWorldStateFromFixture(fixture);
    expect(Object.getPrototypeOf(initial.agentsById)).toBeNull();
    expect(Object.getPrototypeOf(initial.signalsById)).toBeNull();

    for (const hostileId of ['constructor', 'prototype', 'toString']) {
      const state = createInitialWorldStateFromFixture(fixture);
      state.agentsById = { ...state.agentsById };
      const event = makeEvent(1, {
        type: 'agent.arrived',
        payload: { agentId: 'mira', placeId: 'observatory' },
      });
      if (event.type !== 'agent.arrived') throw new Error('Expected an arrival event.');
      event.payload.agentId = hostileId;
      expect(() => reduceWorldEvent(state, event)).toThrow(
        new IllegalTransitionError(`Agent ${hostileId} does not exist in the projection.`),
      );
    }

    const source = fixture.sources[0];
    if (!source) throw new Error('Expected a fixture source.');
    const recorded = reduceWorldEvent(
      createInitialWorldStateFromFixture(fixture),
      makeEvent(1, { type: 'source.recorded', payload: { source } }),
    );
    expect(Object.getPrototypeOf(recorded.sourcesById)).toBeNull();
  });

  it('records sources, claims, and signals only through events', () => {
    const source = fixture.sources[0];
    const claim = fixture.claims[0];
    const signal = fixture.signals[0];
    if (!source || !claim || !signal) {
      throw new Error('Fixture must contain source, claim, and signal records.');
    }

    const events = [
      makeEvent(1, { type: 'source.recorded', payload: { source } }),
      makeEvent(2, { type: 'claim.created', payload: { claim } }),
      makeEvent(3, { type: 'signal.created', payload: { signal } }),
    ];
    const state = replayWorldEvents(createInitialWorldStateFromFixture(fixture), events);

    expect(state.sourcesById[source.id]).toEqual(source);
    expect(state.claimsById[claim.id]).toEqual(claim);
    expect(selectActiveSignals(state).map((item) => item.id)).toEqual([signal.id]);
  });

  it('does not infer knowledge from sharing and updates it only through acquisition events', () => {
    const source = fixture.sources[0];
    const claim = fixture.claims[0];
    const signal = fixture.signals[0];
    if (!source || !claim || !signal) {
      throw new Error('Fixture must contain source, claim, and signal records.');
    }

    const beforeKnowledge = replayWorldEvents(createInitialWorldStateFromFixture(fixture), [
      makeEvent(1, { type: 'source.recorded', payload: { source } }),
      makeEvent(2, { type: 'claim.created', payload: { claim } }),
      makeEvent(3, { type: 'signal.created', payload: { signal } }),
      makeEvent(4, {
        type: 'agent.knowledge.acquired',
        payload: {
          knowledge: {
            agentId: 'mira',
            objectType: 'signal',
            objectId: signal.id,
            acquiredAt: '2027-09-26T18:04:00Z',
            acquisition: { kind: 'system', reason: 'Signal created from Mira investigation.' },
          },
        },
      }),
      makeEvent(5, {
        type: 'signal.shared',
        payload: {
          signalId: signal.id,
          fromAgentId: 'mira',
          toAgentIds: ['orin'],
        },
      }),
    ]);

    expect(
      selectAgentsKnowing(beforeKnowledge, 'signal', signal.id).map((agent) => agent.id),
    ).toEqual(['mira']);
    expect(beforeKnowledge.agentsById['orin']?.knownSignalIds).toEqual([]);

    const acquired = reduceWorldEvent(
      beforeKnowledge,
      makeEvent(6, {
        type: 'agent.knowledge.acquired',
        payload: {
          knowledge: {
            agentId: 'orin',
            objectType: 'signal',
            objectId: signal.id,
            acquiredAt: '2027-09-26T18:05:00Z',
            acquisition: { kind: 'shared', fromAgentId: 'mira' },
          },
        },
      }),
    );

    expect(selectAgentsKnowing(acquired, 'signal', signal.id).map((agent) => agent.id)).toEqual([
      'mira',
      'orin',
    ]);
    expect(acquired.agentsById['orin']?.knownSignalIds).toEqual([signal.id]);
    expect(
      selectKnowledgeDistribution(acquired).find((summary) => summary.agent.id === 'orin')
        ?.signalIds,
    ).toEqual([signal.id]);

    const stale = reduceWorldEvent(
      acquired,
      makeEvent(7, {
        type: 'signal.marked_stale',
        payload: { signalId: signal.id, reason: 'A newer observation is required.' },
      }),
    );
    expect(selectActiveSignals(stale)).toEqual([]);
  });
});

describe('forecast history projection', () => {
  function stateWithForecastEvidence() {
    const source = fixture.sources[0];
    const claim = fixture.claims[0];
    const signal = fixture.signals[0];
    if (!source || !claim || !signal) {
      throw new Error('Fixture must contain source, claim, and signal records.');
    }
    const state = replayWorldEvents(createInitialWorldStateFromFixture(fixture), [
      ...fixture.initialEvents,
      makeEvent(3, { type: 'source.recorded', payload: { source } }),
      makeEvent(4, { type: 'claim.created', payload: { claim } }),
      makeEvent(5, { type: 'signal.created', payload: { signal } }),
    ]);
    return { signal, state };
  }

  it('records commit identity, evidence, previous/new values, and uncertainty', () => {
    const { signal, state } = stateWithForecastEvidence();
    const committed = reduceWorldEvent(state, {
      ...makeEvent(6, {
        type: 'forecast.committed',
        payload: {
          commitId: 'forecast-player-1',
          actor: { kind: 'player' },
          previousProbabilities: { yes: 0.55, no: 0.45 },
          newProbabilities: { yes: 0.48, no: 0.52 },
          uncertainty: {
            yes: { low: 0.44, high: 0.52 },
            no: { low: 0.48, high: 0.56 },
          },
          rationale: 'Crosswinds move the estimate below the team prior.',
          evidenceSignalIds: [signal.id],
          assumptions: ['The advisory overlaps the launch window.'],
          commitType: 'revision',
          publicNote: 'Fresh crosswind evidence lowers my launch estimate.',
          privateMemo: 'Revisit after the final weather review.',
          scoringEligible: true,
        },
      }),
      actor: { kind: 'player' as const },
    });

    expect(committed.forecasts).toHaveLength(2);
    expect(committed.forecasts.at(-1)).toMatchObject({
      commitId: 'forecast-player-1',
      actor: { kind: 'player' },
      previousProbabilities: { yes: 0.55, no: 0.45 },
      newProbabilities: { yes: 0.48, no: 0.52 },
      evidenceSignalIds: [signal.id],
      publicNote: 'Fresh crosswind evidence lowers my launch estimate.',
    });
  });

  it('fails closed when a hold changes probability', () => {
    const { signal, state } = stateWithForecastEvidence();
    const invalid = {
      ...makeEvent(6, {
        type: 'forecast.committed',
        payload: {
          commitId: 'forecast-invalid-hold',
          actor: { kind: 'player' },
          previousProbabilities: { yes: 0.55, no: 0.45 },
          newProbabilities: { yes: 0.48, no: 0.52 },
          rationale: 'This event claims to hold while changing the estimate.',
          evidenceSignalIds: [signal.id],
          commitType: 'hold',
          publicNote: 'Malformed hold.',
          scoringEligible: true,
        },
      }),
      actor: { kind: 'player' as const },
    };

    expect(() => reduceWorldEvent(state, invalid)).toThrowError(
      new IllegalTransitionError('A hold commit cannot change outcome probabilities.'),
    );
  });
});

describe('bounded Professor projection', () => {
  it('rejects response evidence outside the originating query selection', () => {
    const source = fixture.sources[0];
    const signal = fixture.signals[0];
    if (!source || !signal) throw new Error('Fixture must contain Professor evidence.');
    const initial = createInitialWorldStateFromFixture(fixture);
    initial.sourcesById = { [source.id]: structuredClone(source) };
    initial.signalsById = { [signal.id]: structuredClone(signal) };
    const queried = reduceWorldEvent(
      initial,
      makeEvent(1, {
        type: 'professor.query.started',
        payload: {
          query: {
            id: 'query-bounded-1',
            expeditionId: fixture.expedition.id,
            mode: 'explain',
            question: 'Explain the selected signal.',
            selectedSourceIds: [],
            selectedSignalIds: [signal.id],
            createdAt: '2027-09-26T18:10:00Z',
          },
        },
      }),
    );
    const response = {
      queryId: 'query-bounded-1',
      mode: 'explain' as const,
      selectedSignalIds: [signal.id],
      answer: 'A bounded explanation.',
      evidenceUsed: [{ type: 'source' as const, id: source.id }],
      assumptions: ['The record scope is accurate.'],
      limitations: ['The source was not selected.'],
    };

    expect(() =>
      reduceWorldEvent(
        queried,
        makeEvent(2, { type: 'professor.response.created', payload: { response } }),
      ),
    ).toThrow('cites unselected source');
    expect(queried.professorResponsesByQueryId).toEqual({});
  });
});

describe('mission and travel projection', () => {
  const mission: Mission = {
    id: 'mission-meet-orin',
    expeditionId: fixture.expedition.id,
    assignedAgentId: 'mira',
    verb: 'meet_agent',
    objective: 'Meet Orin at Lantern Square.',
    destinationPlaceId: 'square',
    targetAgentIds: ['orin'],
    budget: { maxToolCalls: 0, timeoutMs: 15_000 },
    status: 'queued',
    createdBy: { kind: 'player' },
    createdAt: '2027-09-26T18:01:00Z',
  };

  it('folds a mission through queue, travel, work, and completion without reading a clock', () => {
    const state = replayWorldEvents(createInitialWorldStateFromFixture(fixture), [
      makeEvent(1, { type: 'agent.mission.queued', payload: { mission } }),
      makeEvent(2, {
        type: 'agent.mission.assigned',
        payload: { missionId: mission.id, agentId: 'mira' },
      }),
      makeEvent(3, {
        type: 'agent.travel.started',
        payload: {
          agentId: 'mira',
          missionId: mission.id,
          routeId: 'r-observatory-square',
          fromPlaceId: 'observatory',
          toPlaceId: 'square',
          startedAt: '2027-09-26T18:03:00Z',
          endsAt: '2027-09-26T18:03:06Z',
          durationMs: 6_000,
        },
      }),
      makeEvent(4, {
        type: 'agent.travel.progressed',
        payload: { agentId: 'mira', routeId: 'r-observatory-square', progress: 0.5 },
      }),
      makeEvent(5, {
        type: 'agent.arrived',
        payload: { agentId: 'mira', missionId: mission.id, placeId: 'square' },
      }),
      makeEvent(6, {
        type: 'agent.work.started',
        payload: { agentId: 'mira', missionId: mission.id },
      }),
      makeEvent(7, {
        type: 'agent.mission.completed',
        payload: { missionId: mission.id, completedAt: '2027-09-26T18:07:00Z' },
      }),
    ]);

    expect(state.sequence).toBe(7);
    expect(state.missionsById[mission.id]?.status).toBe('completed');
    expect(state.agentsById['mira']).toMatchObject({
      placeId: 'square',
      publicState: 'idle',
      queuedMissionIds: [],
    });
    expect(state.agentsById['mira']?.movement).toBeUndefined();
    expect(state.agentsById['mira']?.activeMissionId).toBeUndefined();
    expect(selectAgents(state)).toHaveLength(3);
    expect(selectPlaces(state).map((place) => place.id)).toContain('square');
  });

  it('rejects travel from a place where the assigned agent is not located', () => {
    const queued = reduceWorldEvent(
      createInitialWorldStateFromFixture(fixture),
      makeEvent(1, { type: 'agent.mission.queued', payload: { mission } }),
    );
    const illegalTravel = makeEvent(2, {
      type: 'agent.travel.started',
      payload: {
        agentId: 'mira',
        missionId: mission.id,
        routeId: 'r-square-weather',
        fromPlaceId: 'square',
        toPlaceId: 'weather-tower',
        startedAt: '2027-09-26T18:02:00Z',
        endsAt: '2027-09-26T18:02:08Z',
        durationMs: 8_000,
      },
    });

    expect(() => reduceWorldEvent(queued, illegalTravel)).toThrow(IllegalTransitionError);
    expect(() => reduceWorldEvent(queued, illegalTravel)).toThrow('is at observatory, not square');
    expect(queued.sequence).toBe(1);
  });
});
