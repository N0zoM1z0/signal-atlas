import { replayFixture } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createShellModel } from './model.js';

function evidenceProjection() {
  const fixture = createHelios3ExpeditionFixture();
  const projection = replayFixture(fixture).projection;
  projection.sourcesById = Object.fromEntries(fixture.sources.map((source) => [source.id, source]));
  projection.claimsById = Object.fromEntries(fixture.claims.map((claim) => [claim.id, claim]));
  projection.signalsById = Object.fromEntries(fixture.signals.map((signal) => [signal.id, signal]));
  const mira = projection.agentsById['mira'];
  if (mira) mira.knownSignalIds = ['sig-crosswind'];
  return { fixture, projection };
}

describe('signal presentation model', () => {
  it('preserves source, claim, knowledge, status, and correlation boundaries', () => {
    const { projection } = evidenceProjection();
    const crosswind = projection.signalsById['sig-crosswind'];
    const baseRate = projection.signalsById['sig-base-rate'];
    if (!crosswind || !baseRate) throw new Error('Expected authored fixture signals.');
    crosswind.status = 'stale';
    baseRate.status = 'disputed';
    projection.correlationsById['corr-ui-test'] = {
      id: 'corr-ui-test',
      signalIds: [crosswind.id, baseRate.id],
      relationship: 'possibly_correlated',
      reasons: ['Both concern crosswind constraints.'],
      assessedAt: '2027-09-26T18:40:00Z',
    };

    const model = createShellModel(projection);
    const signal = model.signals.find((candidate) => candidate.id === crosswind.id);

    expect(signal).toMatchObject({
      status: 'stale',
      impactRange: '−9 to −4 pp',
      sourceCount: 1,
      sources: [{ id: 'src-weather-bulletin-1' }],
      claims: [{ id: 'claim-crosswind' }],
      knownBy: [{ id: 'mira', name: 'Mira' }],
      correlations: [{ id: 'corr-ui-test', relationship: 'possibly_correlated' }],
    });
    expect(model.signals.find((candidate) => candidate.id === baseRate.id)?.status).toBe(
      'disputed',
    );
  });

  it('keeps a five-card active set available to the scrollable rail', () => {
    const { projection } = evidenceProjection();
    const template = projection.signalsById['sig-crosswind'];
    if (!template) throw new Error('Expected a signal template.');
    projection.signalsById['sig-extra-one'] = {
      ...structuredClone(template),
      id: 'sig-extra-one',
      headline: 'First additional active signal',
    };
    projection.signalsById['sig-extra-two'] = {
      ...structuredClone(template),
      id: 'sig-extra-two',
      headline: 'Second additional active signal',
    };

    expect(createShellModel(projection).signals).toHaveLength(5);
  });

  it('keeps the team forecast distinct from the latest player commit', () => {
    const { projection } = evidenceProjection();
    projection.forecasts.push({
      id: 'evt-player-forecast',
      commitId: 'player-forecast',
      eventId: 'evt-player-forecast',
      sequence: projection.sequence + 1,
      actor: { kind: 'player' },
      previousProbabilities: { yes: 0.55, no: 0.45 },
      newProbabilities: { yes: 0.48, no: 0.52 },
      rationale: 'Player revision with discovered evidence.',
      evidenceSignalIds: ['sig-crosswind'],
      assumptions: [],
      commitType: 'revision',
      publicNote: 'Crosswinds lower my estimate.',
      scoringEligible: true,
      committedAt: '2027-09-26T18:42:00Z',
    });

    expect(createShellModel(projection).market).toMatchObject({
      publicProbability: 61,
      teamProbability: 55,
      playerProbability: 48,
    });
  });
});
