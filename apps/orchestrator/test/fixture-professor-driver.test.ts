import { createInitialWorldStateFromFixture } from '@signal-atlas/simulation';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createScriptedProfessorResponse } from '../src/fixture-professor-driver.js';

const fixture = createHelios3ExpeditionFixture();

function projectionWithFixtureEvidence() {
  const projection = createInitialWorldStateFromFixture(fixture);
  projection.sourcesById = Object.fromEntries(
    fixture.sources.map((source) => [source.id, structuredClone(source)]),
  );
  projection.claimsById = Object.fromEntries(
    fixture.claims.map((claim) => [claim.id, structuredClone(claim)]),
  );
  projection.signalsById = Object.fromEntries(
    fixture.signals.map((signal) => [signal.id, structuredClone(signal)]),
  );
  return projection;
}

function query(
  mode:
    | 'explain'
    | 'challenge'
    | 'compare'
    | 'base_rate'
    | 'missing_evidence'
    | 'correlation_check'
    | 'forecast_impact',
  selectedSignalIds = ['sig-crosswind', 'sig-base-rate'],
  selectedSourceIds = ['src-weather-bulletin-1', 'src-archive-crosswind-1'],
) {
  return {
    id: `query-${mode}`,
    expeditionId: fixture.expedition.id,
    mode,
    question: `Fixture question for ${mode}.`,
    selectedSourceIds,
    selectedSignalIds,
    createdAt: '2027-09-26T18:40:00Z',
  };
}

describe('scripted Professor Vale driver', () => {
  it('adapts the authored correlation answer to the current query without adding evidence', () => {
    const selected = query('correlation_check', [
      'sig-crosswind',
      'sig-base-rate',
      'sig-operations',
    ]);
    const response = createScriptedProfessorResponse(
      fixture,
      projectionWithFixtureEvidence(),
      selected,
    );

    expect(response).toMatchObject({
      queryId: selected.id,
      mode: 'correlation_check',
      answer: expect.stringContaining('related but not duplicates'),
    });
    expect(response.evidenceUsed).toEqual([
      { type: 'signal', id: 'sig-crosswind' },
      { type: 'signal', id: 'sig-base-rate' },
    ]);
    expect(
      response.evidenceUsed.every((item) => selected.selectedSignalIds.includes(item.id)),
    ).toBe(true);
  });

  it('states insufficiency instead of inventing a second signal', () => {
    const selected = query('correlation_check', ['sig-crosswind'], []);
    const response = createScriptedProfessorResponse(
      fixture,
      projectionWithFixtureEvidence(),
      selected,
    );

    expect(response.answer).toContain('Insufficient evidence');
    expect(response.evidenceUsed).toEqual([{ type: 'signal', id: 'sig-crosswind' }]);
    expect(response.limitations[0]).toContain('1 signal');
  });

  it.each([
    'explain',
    'challenge',
    'compare',
    'base_rate',
    'missing_evidence',
    'forecast_impact',
  ] as const)('keeps %s mode bounded to the explicit selection', (mode) => {
    const selected = query(mode);
    const response = createScriptedProfessorResponse(
      fixture,
      projectionWithFixtureEvidence(),
      selected,
    );
    const allowed = new Set([...selected.selectedSignalIds, ...selected.selectedSourceIds]);

    expect(response.mode).toBe(mode);
    expect(response.answer.length).toBeGreaterThan(20);
    expect(response.assumptions.length).toBeGreaterThan(0);
    expect(response.limitations.length).toBeGreaterThan(0);
    expect(response.evidenceUsed.every((item) => allowed.has(item.id))).toBe(true);
  });
});
