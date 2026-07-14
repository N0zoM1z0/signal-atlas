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
});
