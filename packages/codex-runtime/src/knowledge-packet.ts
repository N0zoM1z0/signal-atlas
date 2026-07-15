import type { AgentTurnEvidenceFact, Signal, SourceRecord } from '@signal-atlas/contracts';

export interface CodexPromptSource {
  id: string;
  title: string;
  sourceClass: string;
  retrievedAt: string;
  publisher?: string;
  publishedAt?: string;
  observedAt?: string;
  excerpt?: string;
}

export interface CodexPromptSignal {
  id: string;
  headline: string;
  summary: string;
  sourceIds: string[];
  status: string;
}

export interface CodexPromptEvidenceFact {
  kind: string;
  sourceIds: string[];
  statement: string;
  attributes: Record<string, string | number | boolean | null>;
}

export interface ArchiveKnowledgeGrant {
  placeId: string;
  missionVerb: string;
  sourceIds: readonly string[];
  signalIds: readonly string[];
}

export interface CodexKnowledgePacket {
  access: {
    knownSourceIds: string[];
    knownSignalIds: string[];
    currentTurnSourceIds: string[];
    archiveGrant?: {
      placeId: string;
      missionVerb: string;
      sourceIds: string[];
      signalIds: string[];
    };
  };
  sources: CodexPromptSource[];
  signals: CodexPromptSignal[];
  evidenceFacts?: CodexPromptEvidenceFact[];
  omitted: {
    sources: number;
    signals: number;
    evidenceFacts?: number;
  };
}

export interface BuildKnowledgePacketOptions {
  sources: readonly SourceRecord[];
  signals: readonly Signal[];
  knownSourceIds: readonly string[];
  knownSignalIds: readonly string[];
  currentTurnSourceIds?: readonly string[];
  currentTurnEvidenceFacts?: readonly AgentTurnEvidenceFact[];
  archiveGrant?: ArchiveKnowledgeGrant;
  maxSources?: number;
  maxSignals?: number;
  maxEvidenceFacts?: number;
  maxExcerptChars?: number;
  maxSignalSummaryChars?: number;
}

function stableIds(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function compactText(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 1))}…`;
}

function promptSource(source: SourceRecord, maxExcerptChars: number): CodexPromptSource {
  return {
    id: source.id,
    title: compactText(source.title, 240),
    sourceClass: source.sourceClass,
    retrievedAt: source.retrievedAt,
    ...(source.publisher ? { publisher: compactText(source.publisher, 160) } : {}),
    ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
    ...(source.observedAt ? { observedAt: source.observedAt } : {}),
    ...(source.excerpt ? { excerpt: compactText(source.excerpt, maxExcerptChars) } : {}),
  };
}

function promptSignal(signal: Signal, maxSummaryChars: number): CodexPromptSignal {
  return {
    id: signal.id,
    headline: compactText(signal.headline, 240),
    summary: compactText(signal.summary, maxSummaryChars),
    sourceIds: stableIds(signal.sourceIds),
    status: signal.status,
  };
}

function promptEvidenceFact(fact: AgentTurnEvidenceFact): CodexPromptEvidenceFact {
  return {
    kind: fact.kind,
    sourceIds: stableIds(fact.sourceIds),
    statement: compactText(fact.statement, 1_200),
    attributes: Object.fromEntries(
      Object.entries(fact.attributes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? compactText(value, 1_000) : value,
        ]),
    ),
  };
}

/**
 * Build a bounded packet from explicit knowledge edges and current-turn evidence.
 * The complete source/signal collections are inputs for lookup only; ungranted records never leave.
 */
export function buildKnowledgePacket(options: BuildKnowledgePacketOptions): CodexKnowledgePacket {
  const knownSourceIds = stableIds(options.knownSourceIds);
  const knownSignalIds = stableIds(options.knownSignalIds);
  const currentTurnSourceIds = stableIds(options.currentTurnSourceIds ?? []);
  const archiveSourceIds = stableIds(options.archiveGrant?.sourceIds ?? []);
  const archiveSignalIds = stableIds(options.archiveGrant?.signalIds ?? []);
  const sourceById = new Map(options.sources.map((source) => [source.id, source]));
  const signalById = new Map(options.signals.map((signal) => [signal.id, signal]));
  const allAllowedSources = stableIds([
    ...currentTurnSourceIds,
    ...knownSourceIds,
    ...archiveSourceIds,
  ]).flatMap((sourceId) => {
    const source = sourceById.get(sourceId);
    return source ? [source] : [];
  });
  const currentTurnSourceIdSet = new Set(currentTurnSourceIds);
  allAllowedSources.sort((left, right) => {
    const priority =
      Number(currentTurnSourceIdSet.has(right.id)) - Number(currentTurnSourceIdSet.has(left.id));
    return priority || left.id.localeCompare(right.id);
  });
  const allAllowedSignals = stableIds([...knownSignalIds, ...archiveSignalIds]).flatMap(
    (signalId) => {
      const signal = signalById.get(signalId);
      return signal ? [signal] : [];
    },
  );
  const maxSources = options.maxSources ?? Math.max(12, Math.min(20, currentTurnSourceIds.length));
  const maxSignals = options.maxSignals ?? 10;
  const sources = allAllowedSources
    .slice(0, maxSources)
    .map((source) => promptSource(source, options.maxExcerptChars ?? 1_200));
  const signals = allAllowedSignals
    .slice(0, maxSignals)
    .map((signal) => promptSignal(signal, options.maxSignalSummaryChars ?? 600));
  const includedSourceIds = new Set(sources.map((source) => source.id));
  const allEvidenceFacts = (options.currentTurnEvidenceFacts ?? [])
    .filter((fact) => fact.sourceIds.every((sourceId) => includedSourceIds.has(sourceId)))
    .map(promptEvidenceFact);
  const maxEvidenceFacts = options.maxEvidenceFacts ?? 20;
  const evidenceFacts = allEvidenceFacts.slice(0, maxEvidenceFacts);

  return {
    access: {
      knownSourceIds,
      knownSignalIds,
      currentTurnSourceIds,
      ...(options.archiveGrant
        ? {
            archiveGrant: {
              placeId: options.archiveGrant.placeId,
              missionVerb: options.archiveGrant.missionVerb,
              sourceIds: archiveSourceIds,
              signalIds: archiveSignalIds,
            },
          }
        : {}),
    },
    sources,
    signals,
    ...(evidenceFacts.length > 0 ? { evidenceFacts } : {}),
    omitted: {
      sources: Math.max(0, allAllowedSources.length - sources.length),
      signals: Math.max(0, allAllowedSignals.length - signals.length),
      ...(options.currentTurnEvidenceFacts
        ? { evidenceFacts: Math.max(0, allEvidenceFacts.length - evidenceFacts.length) }
        : {}),
    },
  };
}
