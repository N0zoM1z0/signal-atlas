import heliosFixtureJson from '../../../fixtures/helios3_expedition.json' with { type: 'json' };
import northlightFixtureJson from '../../../fixtures/northlight_harbor_expedition.json' with { type: 'json' };

import {
  ScenarioDefinitionSchema,
  type ScenarioDefinition,
  type ScenarioMetadata,
} from '@signal-atlas/contracts';
import { canonicalHash } from '@signal-atlas/simulation';

export interface InstalledScenarioSummary extends ScenarioMetadata {
  authoredExpeditionId: string;
  definitionHash: string;
  definitionSchemaVersion: number;
}

export interface InstalledScenarioEntry {
  definition: ScenarioDefinition;
  definitionHash: string;
  summary: InstalledScenarioSummary;
}

const heliosDefinitionInput = {
  definitionSchemaVersion: 1,
  scenario: {
    id: 'helios-3-launch-window',
    version: 1,
    title: 'Helios-3 Launch Window',
    category: 'science_technology',
    summary:
      'Investigate a fictional launch window through weather, reporting, historical cases, and explicit source provenance.',
    mode: 'fixture',
    requiredCapabilities: ['local_conditions', 'search_sources'],
    availabilityPolicy: 'live_optional',
    primaryOutcomeId: 'yes',
    preview: {
      template: 'science-space-launch',
      assetPack: 'helios3-programmatic-pilot-v1',
      regionLabel: 'Meridian Coast',
      tagline: 'Separate launch evidence from correlated reports.',
    },
  },
  fixture: heliosFixtureJson,
} as const;

const northlightDefinitionInput = {
  definitionSchemaVersion: 1,
  scenario: {
    id: 'northlight-harbor-watch',
    version: 1,
    title: 'Northlight Harbor Watch',
    category: 'climate_infrastructure',
    summary:
      'Track a fictional harbor suspension decision through sea conditions, authority notices, vessel traffic, historical cases, contradictions, and source revisions.',
    mode: 'fixture',
    requiredCapabilities: ['local_conditions', 'search_sources', 'search_resolution_history'],
    availabilityPolicy: 'live_optional',
    primaryOutcomeId: 'suspended',
    preview: {
      template: 'coastal-harbor',
      assetPack: 'northlight-harbor-programmatic-v1',
      regionLabel: 'Northlight Coast',
      tagline: 'Separate a gale warning from an actual closure order.',
    },
  },
  fixture: northlightFixtureJson,
} as const;

export function scenarioDefinitionHash(definition: ScenarioDefinition): string {
  return canonicalHash(ScenarioDefinitionSchema.parse(definition));
}

function catalogKey(scenarioId: string, version: number): string {
  return `${scenarioId}@${version}`;
}

function entryForDefinition(input: unknown): InstalledScenarioEntry {
  const definition = ScenarioDefinitionSchema.parse(input);
  const definitionHash = scenarioDefinitionHash(definition);
  return {
    definition,
    definitionHash,
    summary: {
      ...definition.scenario,
      authoredExpeditionId: definition.fixture.expedition.id,
      definitionHash,
      definitionSchemaVersion: definition.definitionSchemaVersion,
    },
  };
}

export class InstalledScenarioCatalog {
  readonly #entries = new Map<string, InstalledScenarioEntry>();

  constructor(definitions: readonly unknown[]) {
    for (const input of definitions) {
      const entry = entryForDefinition(input);
      const key = catalogKey(entry.summary.id, entry.summary.version);
      if (this.#entries.has(key)) {
        throw new Error(
          `Installed scenario catalog contains duplicate definition ${entry.summary.id} version ${entry.summary.version}.`,
        );
      }
      this.#entries.set(key, entry);
    }
  }

  list(): InstalledScenarioSummary[] {
    return [...this.#entries.values()]
      .map((entry) => structuredClone(entry.summary))
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          right.version - left.version ||
          left.id.localeCompare(right.id),
      );
  }

  resolve(scenarioId: string, version?: number): InstalledScenarioEntry | undefined {
    const entry =
      version === undefined
        ? [...this.#entries.values()]
            .filter((candidate) => candidate.summary.id === scenarioId)
            .sort((left, right) => right.summary.version - left.summary.version)[0]
        : this.#entries.get(catalogKey(scenarioId, version));
    return entry ? structuredClone(entry) : undefined;
  }

  resolveAuthoredExpedition(expeditionId: string): InstalledScenarioEntry | undefined {
    const entry = [...this.#entries.values()].find(
      (candidate) => candidate.summary.authoredExpeditionId === expeditionId,
    );
    return entry ? structuredClone(entry) : undefined;
  }
}

export const installedScenarioCatalog = new InstalledScenarioCatalog([
  heliosDefinitionInput,
  northlightDefinitionInput,
]);

export function createHeliosScenarioDefinition(): ScenarioDefinition {
  const entry = installedScenarioCatalog.resolve('helios-3-launch-window', 1);
  if (!entry) throw new Error('The installed Helios-3 scenario definition is missing.');
  return entry.definition;
}

export function createNorthlightScenarioDefinition(): ScenarioDefinition {
  const entry = installedScenarioCatalog.resolve('northlight-harbor-watch', 1);
  if (!entry) throw new Error('The installed Northlight Harbor scenario definition is missing.');
  return entry.definition;
}
