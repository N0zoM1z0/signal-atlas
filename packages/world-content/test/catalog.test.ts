import { describe, expect, it } from 'vitest';

import {
  createHeliosScenarioDefinition,
  installedScenarioCatalog,
  InstalledScenarioCatalog,
  scenarioDefinitionHash,
} from '../src/index.js';

describe('installed scenario catalog', () => {
  it('publishes a validated, deterministically hashed Helios definition', () => {
    const definition = createHeliosScenarioDefinition();
    const [summary] = installedScenarioCatalog.list();

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

  it('rejects duplicate scenario versions', () => {
    const definition = createHeliosScenarioDefinition();
    expect(() => new InstalledScenarioCatalog([definition, definition])).toThrow(
      /duplicate definition/u,
    );
  });
});
