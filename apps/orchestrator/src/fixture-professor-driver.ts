import type {
  ExpeditionFixture,
  ProfessorMode,
  ProfessorQuery,
  ProfessorResponse,
  Signal,
  SourceRecord,
} from '@signal-atlas/contracts';
import type { WorldProjection } from '@signal-atlas/simulation';

interface SelectedEvidence {
  signals: Signal[];
  sources: SourceRecord[];
}

function selectedEvidence(query: ProfessorQuery, projection: WorldProjection): SelectedEvidence {
  return {
    signals: query.selectedSignalIds.flatMap((id) => {
      const signal = projection.signalsById[id];
      return signal ? [signal] : [];
    }),
    sources: query.selectedSourceIds.flatMap((id) => {
      const source = projection.sourcesById[id];
      return source ? [source] : [];
    }),
  };
}

function evidenceUsed(evidence: SelectedEvidence): ProfessorResponse['evidenceUsed'] {
  return [
    ...evidence.signals.map((signal) => ({ type: 'signal' as const, id: signal.id })),
    ...evidence.sources.map((source) => ({ type: 'source' as const, id: source.id })),
  ];
}

function evidenceNames(evidence: SelectedEvidence): string {
  return [
    ...evidence.signals.map((signal) => signal.headline),
    ...evidence.sources.map((source) => source.title),
  ].join('; ');
}

function insufficientResponse(
  query: ProfessorQuery,
  evidence: SelectedEvidence,
  requirement: string,
): ProfessorResponse {
  return {
    queryId: query.id,
    mode: query.mode,
    selectedSignalIds: evidence.signals.map((signal) => signal.id),
    answer: `Insufficient evidence: ${requirement}. I will not infer beyond the selected case file.`,
    evidenceUsed: evidenceUsed(evidence),
    assumptions: ['No unselected source or signal may be used to fill the evidence gap.'],
    limitations: [
      `The current selection contains ${evidence.signals.length} signal${evidence.signals.length === 1 ? '' : 's'} and ${evidence.sources.length} source${evidence.sources.length === 1 ? '' : 's'}.`,
    ],
    suggestedNextQuestion: 'Which additional source or signal would most directly resolve the gap?',
  };
}

function genericResponse(
  query: ProfessorQuery,
  evidence: SelectedEvidence,
  mode: ProfessorMode,
  projection: WorldProjection,
): ProfessorResponse {
  const newsroomPlaceId = projection.worldManifest.places.find(
    (place) => place.archetype === 'newsroom',
  )?.id;
  const names = evidenceNames(evidence);
  const used = evidenceUsed(evidence);
  const selectedSignalIds = evidence.signals.map((signal) => signal.id);
  const base = {
    queryId: query.id,
    mode,
    selectedSignalIds,
    evidenceUsed: used,
  };
  switch (mode) {
    case 'explain':
      if (used.length === 0)
        return insufficientResponse(query, evidence, 'select evidence to explain');
      return {
        ...base,
        answer: `The selected record${used.length === 1 ? '' : 's'} say: ${names}. These are directional observations, not a resolved outcome.`,
        assumptions: ['The selected records are interpreted according to their stated scope.'],
        limitations: ['Explanation does not establish causation or evidence independence.'],
        suggestedNextQuestion: 'Which claim in this explanation is most decision-relevant?',
      };
    case 'challenge':
      if (used.length === 0)
        return insufficientResponse(query, evidence, 'select evidence to challenge');
      return {
        ...base,
        answer: `The strongest challenge is scope: ${names}. Reliability labels and excerpts do not guarantee that the evidence covers the full resolution rule for “${projection.market.question}”`,
        assumptions: ['Published and retrieved timestamps accurately describe freshness.'],
        limitations: [
          ...evidence.signals.map(
            (signal) => `${signal.headline}: ${signal.reliability.reasons.join(' ')}`,
          ),
          ...evidence.sources.map(
            (source) =>
              `${source.title}: source class ${source.sourceClass}, version ${source.version}.`,
          ),
        ],
        suggestedNextQuestion: 'What observation would falsify the selected interpretation?',
      };
    case 'compare':
      if (used.length < 2)
        return insufficientResponse(query, evidence, 'select at least two records to compare');
      return {
        ...base,
        answer: `The records differ in role and scope: ${names}. Compare their dates, source classes, and target claims before combining their impact.`,
        assumptions: ['The selected records refer to the same market question.'],
        limitations: [
          'A comparison alone does not determine whether sources share an upstream cause.',
        ],
        suggestedNextQuestion: 'Do these records depend on the same event or publisher?',
      };
    case 'base_rate': {
      const baseRateSources = evidence.sources.filter(
        (source) => source.sourceClass === 'archive' || source.tags.includes('base-rate'),
      );
      const baseRateSignals = evidence.signals.filter((signal) =>
        /base rate|historical|comparable/i.test(`${signal.headline} ${signal.summary}`),
      );
      if (baseRateSources.length + baseRateSignals.length === 0) {
        return insufficientResponse(
          query,
          evidence,
          'select a historical or archive record for a base-rate reading',
        );
      }
      return {
        ...base,
        answer: `The selected historical evidence supplies a conditional base rate: ${[
          ...baseRateSignals.map((signal) => signal.headline),
          ...baseRateSources.map((source) => source.title),
        ].join(
          '; ',
        )}. Apply it only to cases comparable on the mechanism and resolution rule that matter here.`,
        assumptions: ['The archived cases are comparable on the mechanism relevant to resolution.'],
        limitations: [
          'A mixed historical sample may not transport cleanly to the current market question.',
        ],
        suggestedNextQuestion: 'Which archived cases most closely match this resolution rule?',
      };
    }
    case 'missing_evidence':
      return {
        ...base,
        answer:
          used.length === 0
            ? 'Insufficient evidence: no case-file items are selected. Start with one primary current source and one genuinely comparable historical record.'
            : `The selection covers ${names}, but still needs a direct resolution-relevant source and an independence check before a confident revision.`,
        assumptions: ['The forecast decision depends on timing, scope, and evidence direction.'],
        limitations: ['Missing-evidence analysis cannot prove that an unavailable source exists.'],
        suggestedNextQuestion:
          'What current primary source most directly addresses the resolution rule?',
        suggestedMission: {
          verb: 'verify',
          objective: 'Check the latest primary record that directly addresses the resolution rule.',
          ...(newsroomPlaceId ? { destinationPlaceId: newsroomPlaceId } : {}),
        },
      };
    case 'correlation_check':
      if (evidence.signals.length < 2) {
        return insufficientResponse(
          query,
          evidence,
          'select at least two signals to assess dependence',
        );
      }
      return {
        ...base,
        answer: `The selected signals may be related without being duplicates: ${names}. Treat shared mechanisms or upstream sources as a reason to discount simple additive impact.`,
        assumptions: ['Distinct signal IDs do not imply statistical independence.'],
        limitations: ['The fixture has no measured covariance or controlled causal estimate.'],
        suggestedNextQuestion: 'Which shared mechanism could generate both selected signals?',
      };
    case 'forecast_impact':
      if (evidence.signals.length === 0) {
        return insufficientResponse(
          query,
          evidence,
          'select at least one signal with an impact range',
        );
      }
      return {
        ...base,
        answer: `The selected impact ranges are ${evidence.signals
          .map((signal) => {
            const range = signal.impact.probabilityPointRange;
            return `${signal.headline}: ${range ? `${Math.round(range.low * 100)} to ${Math.round(range.high * 100)} points` : 'direction only'}`;
          })
          .join('; ')}. Use them as a sensitivity range, not a mechanical sum.`,
        assumptions: ['Authored impact ranges are calibrated as directional scenario inputs.'],
        limitations: ['Correlation can make the combined effect smaller than a simple sum.'],
        suggestedNextQuestion:
          'What forecast remains reasonable under the least and most severe combined impact?',
      };
  }
}

/** Deterministic, evidence-bounded Professor Vale response for fixture mode. */
export function createScriptedProfessorResponse(
  fixture: ExpeditionFixture,
  projection: WorldProjection,
  query: ProfessorQuery,
): ProfessorResponse {
  const evidence = selectedEvidence(query, projection);
  const fixtureSignalIds = fixture.professorFixture.selectedSignalIds ?? [];
  const matchesAuthoredCorrelationCase =
    query.mode === 'correlation_check' &&
    fixtureSignalIds.length > 0 &&
    fixtureSignalIds.every((id) => evidence.signals.some((signal) => signal.id === id));
  if (!matchesAuthoredCorrelationCase) {
    return genericResponse(query, evidence, query.mode, projection);
  }

  const allowedSignalIds = new Set(evidence.signals.map((signal) => signal.id));
  const allowedSourceIds = new Set(evidence.sources.map((source) => source.id));
  const authored = fixture.professorFixture;
  return {
    ...structuredClone(authored),
    queryId: query.id,
    mode: query.mode,
    selectedSignalIds: evidence.signals.map((signal) => signal.id),
    evidenceUsed: authored.evidenceUsed.filter((item) =>
      item.type === 'signal' ? allowedSignalIds.has(item.id) : allowedSourceIds.has(item.id),
    ),
  };
}
