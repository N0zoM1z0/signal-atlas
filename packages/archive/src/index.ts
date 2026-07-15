import {
  projectionHash,
  type ForecastProjection,
  type MeetingMemoProjection,
  type ScoreProjection,
  type WorldProjection,
} from '@signal-atlas/simulation';
import type {
  Claim,
  Expedition,
  Market,
  MeetingMemo,
  Signal,
  SourceRecord,
  WorldEvent,
  WorldEventType,
} from '@signal-atlas/contracts';
import { binaryMarketOutcomes } from '@signal-atlas/contracts';

export type ArchiveEntryKind = 'source' | 'signal' | 'memo';

interface ArchiveEntryBase {
  archiveId: string;
  entityId: string;
  kind: ArchiveEntryKind;
  title: string;
  summary: string;
  entryDate: string;
  enteredAt?: string;
  entrySequence?: number;
  placeIds: string[];
  sourceClasses: SourceRecord['sourceClass'][];
  agentIds: string[];
  tags: string[];
  status: string;
  searchText: string;
}

export interface ArchiveSourceEntry extends ArchiveEntryBase {
  kind: 'source';
  source: SourceRecord;
  supersededBySourceId?: string;
}

export interface ArchiveSignalEntry extends ArchiveEntryBase {
  kind: 'signal';
  signal: Signal;
  sources: SourceRecord[];
}

export interface ArchiveMemoEntry extends ArchiveEntryBase {
  kind: 'memo';
  meetingId: string;
  memo: MeetingMemo;
}

export type ArchiveEntry = ArchiveSourceEntry | ArchiveSignalEntry | ArchiveMemoEntry;

export interface ArchiveIndex {
  entries: ArchiveEntry[];
  agentOptions: Array<{ id: string; label: string }>;
  placeOptions: Array<{ id: string; label: string }>;
  sourceClassOptions: SourceRecord['sourceClass'][];
}

export interface ArchiveSearchQuery {
  text?: string;
  kind?: 'all' | ArchiveEntryKind;
  dateFrom?: string;
  dateTo?: string;
  placeId?: string;
  sourceClass?: SourceRecord['sourceClass'];
  agentId?: string;
}

export type CaseFileTurningPointKind = 'source' | 'signal' | 'forecast' | 'resolution' | 'score';

export interface CaseFileTurningPoint {
  sequence: number;
  eventId: string;
  eventType: WorldEventType;
  occurredAt: string;
  kind: CaseFileTurningPointKind;
  label: string;
  entityType: 'source' | 'signal' | 'forecast' | 'market' | 'score';
  entityId: string;
}

export interface CaseFileForecastRationale {
  forecastId: string;
  commitId?: string;
  sequence: number;
  committedAt: string;
  actor: ForecastProjection['actor'];
  previousProbabilities: ForecastProjection['previousProbabilities'];
  newProbabilities: ForecastProjection['newProbabilities'];
  rationale: string;
  evidenceSignalIds: string[];
  assumptions: string[];
  commitType?: ForecastProjection['commitType'];
  publicNote?: string;
  scoringEligible?: boolean;
  score?: ScoreProjection;
}

export interface CaseFileResolution {
  outcomeId: string;
  resolvedAt: string;
  note?: string;
  marketEventId: string;
}

export interface SignalAtlasCaseFile {
  schemaVersion: 1;
  kind: 'signal-atlas.case-file';
  recordedThroughSequence: number;
  finalProjectionHash: string;
  expedition: Expedition;
  market: Market;
  resolution?: CaseFileResolution;
  sources: SourceRecord[];
  claims: Claim[];
  signals: Signal[];
  forecastRationales: CaseFileForecastRationale[];
  scores: ScoreProjection[];
  turningPoints: CaseFileTurningPoint[];
  events: WorldEvent[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function introductionFor(
  kind: ArchiveEntryKind,
  entityId: string,
  events: readonly WorldEvent[],
): WorldEvent | undefined {
  return events.find((event) => {
    if (kind === 'source') {
      return (
        (event.type === 'source.recorded' && event.payload.source.id === entityId) ||
        (event.type === 'source.superseded' && event.payload.source.id === entityId)
      );
    }
    if (kind === 'signal') {
      return event.type === 'signal.created' && event.payload.signal.id === entityId;
    }
    return event.type === 'meeting.memo_created' && event.payload.meetingId === entityId;
  });
}

function searchable(...values: unknown[]): string {
  return values
    .flat(Infinity)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase('en-US');
}

function knowledgeAgents(
  projection: WorldProjection,
  objectType: 'source' | 'signal' | 'memo',
  objectId: string,
): string[] {
  return unique(
    Object.values(projection.knowledgeByKey)
      .filter((knowledge) => knowledge.objectType === objectType && knowledge.objectId === objectId)
      .map((knowledge) => knowledge.agentId),
  );
}

function memoEntry(
  projection: WorldProjection,
  memoProjection: MeetingMemoProjection,
  events: readonly WorldEvent[],
): ArchiveMemoEntry {
  const meeting = projection.meetingsById[memoProjection.meetingId];
  const introduction = introductionFor('memo', memoProjection.meetingId, events);
  const agentIds = unique(meeting?.participantAgentIds ?? []);
  const agentNames = agentIds.map((id) => projection.agentsById[id]?.displayName ?? id);
  const memo = structuredClone(memoProjection.memo);
  return {
    archiveId: `memo:${memoProjection.meetingId}`,
    entityId: memoProjection.meetingId,
    kind: 'memo',
    title: `Meeting memo · ${agentNames.join(', ') || memoProjection.meetingId}`,
    summary: memo.summary,
    entryDate: memoProjection.createdAt,
    ...(introduction
      ? { enteredAt: introduction.occurredAt, entrySequence: introduction.sequence }
      : { entrySequence: memoProjection.sequence }),
    placeIds: meeting ? [meeting.placeId] : [],
    sourceClasses: [],
    agentIds,
    tags: ['meeting', ...(meeting?.disagreementTypes ?? [])],
    status: meeting?.endedAt ? 'complete' : 'recorded',
    searchText: searchable(
      memo.summary,
      memo.agreements,
      memo.disagreements,
      memo.followUpMissionProposals.map((proposal) => proposal.objective),
      agentNames,
      meeting
        ? projection.worldManifest.places.find((place) => place.id === meeting.placeId)?.name
        : '',
    ),
    meetingId: memoProjection.meetingId,
    memo,
  };
}

/** Build a local, deterministic index exclusively from the current authoritative projection. */
export function createArchiveIndex(
  projection: WorldProjection,
  events: readonly WorldEvent[] = [],
): ArchiveIndex {
  const placeName = (id: string) =>
    projection.worldManifest.places.find((place) => place.id === id)?.name ?? id;
  const supersededBy = new Map<string, string>();
  for (const source of Object.values(projection.sourcesById)) {
    if (source.supersedesSourceId) supersededBy.set(source.supersedesSourceId, source.id);
  }

  const sourceEntries: ArchiveSourceEntry[] = Object.values(projection.sourcesById).map(
    (source) => {
      const introduction = introductionFor('source', source.id, events);
      const supersededBySourceId = supersededBy.get(source.id);
      const placeIds = source.location?.placeId ? [source.location.placeId] : [];
      const agentIds = knowledgeAgents(projection, 'source', source.id);
      return {
        archiveId: `source:${source.id}`,
        entityId: source.id,
        kind: 'source',
        title: source.title,
        summary: source.excerpt ?? `${source.publisher ?? 'Unknown publisher'} source record.`,
        entryDate: source.publishedAt ?? source.observedAt ?? source.retrievedAt,
        ...(introduction
          ? { enteredAt: introduction.occurredAt, entrySequence: introduction.sequence }
          : {}),
        placeIds,
        sourceClasses: [source.sourceClass],
        agentIds,
        tags: [...source.tags],
        status: supersededBySourceId ? 'superseded' : 'current',
        searchText: searchable(
          source.title,
          source.publisher,
          source.author,
          source.excerpt,
          source.externalUri,
          source.tags,
          source.sourceClass,
          placeIds.map(placeName),
          agentIds.map((id) => projection.agentsById[id]?.displayName ?? id),
        ),
        source: structuredClone(source),
        ...(supersededBySourceId ? { supersededBySourceId } : {}),
      };
    },
  );

  const signalEntries: ArchiveSignalEntry[] = Object.values(projection.signalsById).map(
    (signal) => {
      const introduction = introductionFor('signal', signal.id, events);
      const sources = signal.sourceIds.flatMap((id) => {
        const source = projection.sourcesById[id];
        return source ? [structuredClone(source)] : [];
      });
      const claims = signal.claimIds.flatMap((id) => {
        const claim = projection.claimsById[id];
        return claim ? [claim] : [];
      });
      const placeIds = unique(
        sources.flatMap((source) => (source.location?.placeId ? [source.location.placeId] : [])),
      );
      const agentIds = unique([
        ...(signal.discoveredByAgentId ? [signal.discoveredByAgentId] : []),
        ...knowledgeAgents(projection, 'signal', signal.id),
      ]);
      const sourceClasses = unique(
        sources.map((source) => source.sourceClass),
      ) as SourceRecord['sourceClass'][];
      return {
        archiveId: `signal:${signal.id}`,
        entityId: signal.id,
        kind: 'signal',
        title: signal.headline,
        summary: signal.summary,
        entryDate: signal.createdAt,
        ...(introduction
          ? { enteredAt: introduction.occurredAt, entrySequence: introduction.sequence }
          : {}),
        placeIds,
        sourceClasses,
        agentIds,
        tags: unique([
          ...sources.flatMap((source) => source.tags),
          signal.direction,
          signal.status,
        ]),
        status: signal.status,
        searchText: searchable(
          signal.headline,
          signal.summary,
          signal.direction,
          signal.status,
          signal.reliability.label,
          claims.map((claim) => [claim.text, claim.qualifiers]),
          sources.map((source) => [source.title, source.publisher, source.excerpt, source.tags]),
          placeIds.map(placeName),
          agentIds.map((id) => projection.agentsById[id]?.displayName ?? id),
        ),
        signal: structuredClone(signal),
        sources,
      };
    },
  );

  const memoEntries = Object.values(projection.meetingMemosById).map((memo) =>
    memoEntry(projection, memo, events),
  );
  const entries = [...sourceEntries, ...signalEntries, ...memoEntries].sort(
    (left, right) =>
      right.entryDate.localeCompare(left.entryDate) ||
      left.archiveId.localeCompare(right.archiveId),
  );

  return {
    entries,
    agentOptions: Object.values(projection.agentsById)
      .map((agent) => ({ id: agent.id, label: agent.displayName }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    placeOptions: projection.worldManifest.places
      .map((place) => ({ id: place.id, label: place.name }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    sourceClassOptions: unique(
      sourceEntries.map((entry) => entry.source.sourceClass),
    ) as SourceRecord['sourceClass'][],
  };
}

function dateBoundary(value: string | undefined, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function searchArchive(index: ArchiveIndex, query: ArchiveSearchQuery): ArchiveEntry[] {
  const tokens = query.text?.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean) ?? [];
  const from = dateBoundary(query.dateFrom, false);
  const to = dateBoundary(query.dateTo, true);
  return index.entries.filter((entry) => {
    const entryTimestamp = Date.parse(entry.entryDate);
    return (
      (query.kind === undefined || query.kind === 'all' || entry.kind === query.kind) &&
      tokens.every((token) => entry.searchText.includes(token)) &&
      (from === undefined || entryTimestamp >= from) &&
      (to === undefined || entryTimestamp <= to) &&
      (!query.placeId || entry.placeIds.includes(query.placeId)) &&
      (!query.sourceClass || entry.sourceClasses.includes(query.sourceClass)) &&
      (!query.agentId || entry.agentIds.includes(query.agentId))
    );
  });
}

/** Derive replay navigation exclusively from authoritative domain events. */
export function createCaseFileTurningPoints(
  projection: WorldProjection,
  events: readonly WorldEvent[],
): CaseFileTurningPoint[] {
  return events.flatMap((event): CaseFileTurningPoint[] => {
    switch (event.type) {
      case 'source.recorded':
      case 'source.superseded':
        return [
          {
            sequence: event.sequence,
            eventId: event.id,
            eventType: event.type,
            occurredAt: event.occurredAt,
            kind: 'source',
            label:
              event.type === 'source.superseded'
                ? `Source version entered · ${event.payload.source.title}`
                : `Source entered · ${event.payload.source.title}`,
            entityType: 'source',
            entityId: event.payload.source.id,
          },
        ];
      case 'signal.created':
        return [
          {
            sequence: event.sequence,
            eventId: event.id,
            eventType: event.type,
            occurredAt: event.occurredAt,
            kind: 'signal',
            label: `Signal entered · ${event.payload.signal.headline}`,
            entityType: 'signal',
            entityId: event.payload.signal.id,
          },
        ];
      case 'forecast.committed': {
        const forecast = projection.forecasts.find((candidate) => candidate.eventId === event.id);
        const primaryOutcome = binaryMarketOutcomes(projection.market).primary;
        return [
          {
            sequence: event.sequence,
            eventId: event.id,
            eventType: event.type,
            occurredAt: event.occurredAt,
            kind: 'forecast',
            label: `Forecast committed · ${Math.round((event.payload.newProbabilities[primaryOutcome.id] ?? 0) * 100)}% ${primaryOutcome.shortLabel}`,
            entityType: 'forecast',
            entityId: forecast?.id ?? event.id,
          },
        ];
      }
      case 'market.resolved': {
        const outcome = projection.market.outcomes.find(
          (candidate) => candidate.id === event.payload.resolvedOutcomeId,
        );
        return [
          {
            sequence: event.sequence,
            eventId: event.id,
            eventType: event.type,
            occurredAt: event.occurredAt,
            kind: 'resolution',
            label: `Market resolved · ${outcome?.label ?? event.payload.resolvedOutcomeId}`,
            entityType: 'market',
            entityId: projection.market.id,
          },
        ];
      }
      case 'score.calculated': {
        const score = projection.scores.find((candidate) => candidate.eventId === event.id);
        return [
          {
            sequence: event.sequence,
            eventId: event.id,
            eventType: event.type,
            occurredAt: event.occurredAt,
            kind: 'score',
            label: `Forecast scored · ${(score?.brierScore ?? event.payload.brierScore).toFixed(4)} Brier`,
            entityType: 'score',
            entityId: event.id,
          },
        ];
      }
      default:
        return [];
    }
  });
}

function publicEvent(event: WorldEvent): WorldEvent {
  if (event.type !== 'forecast.committed') return structuredClone(event);
  const cloned = structuredClone(event);
  delete cloned.payload.privateMemo;
  return cloned;
}

/** Hash only the projection fields a public case file can reproduce from its exported events. */
export function publicProjectionHash(projection: WorldProjection): string {
  const cloned = structuredClone(projection);
  for (const forecast of cloned.forecasts) delete forecast.privateMemo;
  return projectionHash(cloned);
}

/**
 * Build a deterministic public case file. Forecast private memos are deliberately omitted from
 * both the rationale section and the exported event stream.
 */
export function createSignalAtlasCaseFile(
  projection: WorldProjection,
  events: readonly WorldEvent[],
): SignalAtlasCaseFile {
  const resolutionEvent = events.findLast((event) => event.type === 'market.resolved');
  const scoresByForecastId = new Map(
    projection.scores.flatMap((score) =>
      score.forecastCommitId ? [[score.forecastCommitId, score] as const] : [],
    ),
  );
  const forecastRationales = projection.forecasts.map((forecast): CaseFileForecastRationale => {
    const score = scoresByForecastId.get(forecast.id);
    return {
      forecastId: forecast.id,
      ...(forecast.commitId ? { commitId: forecast.commitId } : {}),
      sequence: forecast.sequence,
      committedAt: forecast.committedAt,
      actor: structuredClone(forecast.actor),
      previousProbabilities: structuredClone(forecast.previousProbabilities),
      newProbabilities: structuredClone(forecast.newProbabilities),
      rationale: forecast.rationale,
      evidenceSignalIds: [...forecast.evidenceSignalIds],
      assumptions: [...forecast.assumptions],
      ...(forecast.commitType ? { commitType: forecast.commitType } : {}),
      ...(forecast.publicNote ? { publicNote: forecast.publicNote } : {}),
      ...(forecast.scoringEligible !== undefined
        ? { scoringEligible: forecast.scoringEligible }
        : {}),
      ...(score ? { score: structuredClone(score) } : {}),
    };
  });

  return {
    schemaVersion: 1,
    kind: 'signal-atlas.case-file',
    recordedThroughSequence: projection.sequence,
    finalProjectionHash: publicProjectionHash(projection),
    expedition: structuredClone(projection.expedition),
    market: structuredClone(projection.market),
    ...(resolutionEvent?.type === 'market.resolved'
      ? {
          resolution: {
            outcomeId: resolutionEvent.payload.resolvedOutcomeId,
            resolvedAt: resolutionEvent.payload.resolvedAt,
            ...(resolutionEvent.payload.resolutionNote
              ? { note: resolutionEvent.payload.resolutionNote }
              : {}),
            marketEventId: resolutionEvent.id,
          },
        }
      : {}),
    sources: Object.values(projection.sourcesById)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((source) => structuredClone(source)),
    claims: Object.values(projection.claimsById)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((claim) => structuredClone(claim)),
    signals: Object.values(projection.signalsById)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((signal) => structuredClone(signal)),
    forecastRationales,
    scores: projection.scores.map((score) => structuredClone(score)),
    turningPoints: createCaseFileTurningPoints(projection, events),
    events: events.map(publicEvent),
  };
}
