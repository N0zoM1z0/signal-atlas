import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { renderSchemaArtifacts, schemaDirectory } from '../scripts/generate-schemas.js';

describe('published contract artifacts', () => {
  it('matches every generated JSON Schema byte for byte', () => {
    const artifacts = renderSchemaArtifacts();
    expect(artifacts.size).toBeGreaterThanOrEqual(18);
    for (const [filename, expected] of artifacts) {
      expect(readFileSync(`${schemaDirectory}${filename}`, 'utf8'), filename).toBe(expected);
    }
  });

  it('keeps the runtime contracts infrastructure-independent', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies).toEqual({ zod: '4.4.3' });
  });

  it('publishes a Codex transport schema with every object property required', () => {
    const schema = JSON.parse(
      readFileSync(`${schemaDirectory}agent-turn-output.codex.schema.json`, 'utf8'),
    ) as unknown;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record['type'] === 'object' && record['properties']) {
        expect(record['additionalProperties']).toBe(false);
        expect(new Set(record['required'] as string[])).toEqual(
          new Set(Object.keys(record['properties'] as Record<string, unknown>)),
        );
      }
      Object.values(record).forEach(visit);
    };
    visit(schema);
  });
});
