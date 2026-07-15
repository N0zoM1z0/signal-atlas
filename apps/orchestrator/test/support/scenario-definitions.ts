import { ScenarioDefinitionSchema, type ScenarioDefinition } from '@signal-atlas/contracts';
import { createHeliosScenarioDefinition } from '@signal-atlas/world-content';

function replaceIdentity(value: unknown, identities: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return identities.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceIdentity(item, identities));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, replaceIdentity(child, identities)]),
  );
}

export function createTestRiverScenarioDefinition(): ScenarioDefinition {
  const base = createHeliosScenarioDefinition();
  const fixture = replaceIdentity(
    structuredClone(base.fixture),
    new Map([
      ['exp-helios3-demo', 'exp-test-river-demo'],
      ['market-helios3-2027', 'market-test-river-2027'],
      ['world-helios3-v1', 'world-test-river-v1'],
      ['evt-0001', 'evt-test-river-0001'],
      ['evt-0002', 'evt-test-river-0002'],
    ]),
  ) as ScenarioDefinition['fixture'];

  fixture.seed = 'test-river-registry-v1';
  fixture.expedition.title = 'Test River Crossing';
  fixture.market.question = 'Will the fictional river remain below the warning line?';

  return ScenarioDefinitionSchema.parse({
    ...base,
    scenario: {
      ...base.scenario,
      id: 'test-river-crossing',
      title: 'Test River Crossing',
      summary: 'A second deterministic scenario used to prove expedition isolation.',
      preview: {
        ...base.scenario.preview,
        regionLabel: 'Test River',
        tagline: 'Prove that two authored worlds remain isolated.',
      },
    },
    fixture,
  });
}
