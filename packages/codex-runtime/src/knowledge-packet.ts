import type { Signal, SourceRecord } from '@signal-atlas/contracts';

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
  omitted: {
    sources: number;
    signals: number;
  };
}

export interface BuildKnowledgePacketOptions {
  sources: readonly SourceRecord[];
  signals: readonly Signal[];
  knownSourceIds: readonly string[];
  knownSignalIds: readonly string[];
  currentTurnSourceIds?: readonly string[];
  archiveGrant?: ArchiveKnowledgeGrant;
  maxSources?: number;
  maxSignals?: number;
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
  const allowedSourceIds = new Set([
    ...knownSourceIds,
    ...currentTurnSourceIds,
    ...archiveSourceIds,
  ]);
  const allowedSignalIds = new Set([...knownSignalIds, ...archiveSignalIds]);
  const allAllowedSources = options.sources
    .filter((source) => allowedSourceIds.has(source.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const allAllowedSignals = options.signals
    .filter((signal) => allowedSignalIds.has(signal.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const maxSources = options.maxSources ?? 12;
  const maxSignals = options.maxSignals ?? 10;
  const sources = allAllowedSources
    .slice(0, maxSources)
    .map((source) => promptSource(source, options.maxExcerptChars ?? 1_200));
  const signals = allAllowedSignals
    .slice(0, maxSignals)
    .map((signal) => promptSignal(signal, options.maxSignalSummaryChars ?? 600));

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
    omitted: {
      sources: Math.max(0, allAllowedSources.length - sources.length),
      signals: Math.max(0, allAllowedSignals.length - signals.length),
    },
  };
}
