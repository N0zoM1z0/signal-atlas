import { describe, expect, it } from 'vitest';

import {
  createHeliosScenarioDefinition,
  createNorthbridgeScenarioDefinition,
  createNorthlightScenarioDefinition,
  installedScenarioCatalog,
  InstalledScenarioCatalog,
  scenarioDefinitionHash,
} from '../src/index.js';

describe('installed scenario catalog', () => {
  it('publishes a validated, deterministically hashed Helios definition', () => {
    const definition = createHeliosScenarioDefinition();
    const summary = installedScenarioCatalog
      .list()
      .find(({ id }) => id === 'helios-3-launch-window');

    expect(summary).toMatchObject({
      id: 'helios-3-launch-window',
      version: 1,
      authoredExpeditionId: 'exp-helios3-demo',
      definitionSchemaVersion: 1,
      preview: {
        template: definition.fixture.worldManifest.template,
        assetPack: definition.fixture.worldManifest.assetPack,
      },
    });
    expect(summary?.definitionHash).toBe(scenarioDefinitionHash(definition));

    definition.scenario.title = 'Mutated caller copy';
    expect(createHeliosScenarioDefinition().scenario.title).toBe('Helios-3 Launch Window');
  });

  it('publishes a materially distinct, offline-ready Northlight Harbor definition', () => {
    const definition = createNorthlightScenarioDefinition();
    const summary = installedScenarioCatalog
      .list()
      .find(({ id }) => id === 'northlight-harbor-watch');
    const serialized = JSON.stringify(definition);

    expect(summary).toMatchObject({
      id: 'northlight-harbor-watch',
      authoredExpeditionId: 'exp-northlight-harbor-demo',
      primaryOutcomeId: 'suspended',
      preview: {
        template: 'coastal-harbor',
        assetPack: 'northlight-harbor-programmatic-v1',
      },
    });
    expect(definition.fixture.market.outcomes.map(({ id }) => id)).toEqual([
      'suspended',
      'operating',
    ]);
    expect(definition.fixture.sources.some(({ supersedesSourceId }) => supersedesSourceId)).toBe(
      true,
    );
    expect(
      definition.fixture.signals.some(({ correlationGroupIds }) => correlationGroupIds.length > 1),
    ).toBe(true);
    expect(serialized).not.toMatch(/Helios|Galehaven|Meridian Coast|Lantern Square|launch/iu);
    expect(summary?.definitionHash).toBe(scenarioDefinitionHash(definition));
  });

  it('publishes a Pref-rich Northbridge policy world with explicit live boundaries', () => {
    const definition = createNorthbridgeScenarioDefinition();
    const summary = installedScenarioCatalog
      .list()
      .find(({ id }) => id === 'northbridge-monetary-council');
    const serialized = JSON.stringify(definition);

    expect(summary).toMatchObject({
      id: 'northbridge-monetary-council',
      authoredExpeditionId: 'exp-northbridge-council-demo',
      primaryOutcomeId: 'cut',
      preview: {
        template: 'ledger-civic-industrial',
        assetPack: 'northbridge-ledger-programmatic-v1',
      },
    });
    expect(definition.fixture.market.outcomes.map(({ id }) => id)).toEqual(['cut', 'hold']);
    expect(summary?.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'search_sources',
        'search_markets',
        'search_resolution_history',
        'search_economic_series',
        'read_economic_series',
        'search_official_records',
      ]),
    );
    expect(
      definition.fixture.sources.some(
        ({ supersedesSourceId }) => supersedesSourceId === 'src-northbridge-inflation-flash-1',
      ),
    ).toBe(true);
    expect(
      definition.fixture.signals.find(({ id }) => id === 'sig-northbridge-market'),
    ).toMatchObject({ direction: 'context', impact: { label: 'unknown' } });
    expect(serialized).not.toMatch(
      /Helios|Galehaven|Meridian Coast|Lantern Square|Northlight|harbor|launch/iu,
    );
    expect(summary?.definitionHash).toBe(scenarioDefinitionHash(definition));
  });

  it('rejects duplicate scenario versions', () => {
    const definition = createHeliosScenarioDefinition();
    expect(() => new InstalledScenarioCatalog([definition, definition])).toThrow(
      /duplicate definition/u,
    );
  });
});
