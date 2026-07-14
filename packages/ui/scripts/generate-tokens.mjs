import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const sourcePath = path.join(repositoryRoot, 'design-tokens.json');
const outputDirectory = path.join(repositoryRoot, 'packages/ui/src/generated');

const tokens = JSON.parse(await readFile(sourcePath, 'utf8'));

function toKebabCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

function cssValue(parts, value) {
  if (typeof value !== 'number') return String(value);

  const [section, group, name] = parts;
  if (['spacing', 'size', 'radius', 'border'].includes(section)) return `${value}px`;
  if (section === 'typography' && group === 'size') return `${value}px`;
  if (section === 'motion' && !String(name ?? group).toLowerCase().includes('fps')) {
    return `${value}ms`;
  }
  return String(value);
}

function flatten(value, parts = [], result = []) {
  for (const [key, child] of Object.entries(value)) {
    const next = [...parts, key];
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      flatten(child, next, result);
    } else {
      result.push([next, child]);
    }
  }
  return result;
}

const cssSections = [
  'color',
  'spacing',
  'size',
  'radius',
  'border',
  'shadow',
  'typography',
  'motion',
  'zIndex',
];

const cssLines = cssSections.flatMap((section) =>
  flatten(tokens[section], [section]).map(([parts, value]) => {
    const property = parts.map(toKebabCase).join('-');
    return `  --sa-${property}: ${cssValue(parts, value)};`;
  }),
);

const typescriptOutput = `// Generated from design-tokens.json. Do not edit manually.\n\nexport const tokens = ${JSON.stringify(tokens, null, 2)} as const;\n\nexport type DesignTokens = typeof tokens;\n`;
const cssOutput = `/* Generated from design-tokens.json. Do not edit manually. */\n\n:root {\n${cssLines.join('\n')}\n}\n`;

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'tokens.ts'), typescriptOutput, 'utf8'),
  writeFile(path.join(outputDirectory, 'tokens.css'), cssOutput, 'utf8'),
]);
