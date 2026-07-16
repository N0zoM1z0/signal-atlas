import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const distDirectory = new URL('../dist/', import.meta.url);
const indexHtml = await readFile(new URL('index.html', distDirectory), 'utf8');

if (!indexHtml.includes('/signal-atlas/assets/')) {
  throw new Error('The Pages artifact does not use the /signal-atlas/ project base path.');
}

const assetDirectory = new URL('assets/', distDirectory);
const assetNames = await readdir(assetDirectory);
const javascript = (
  await Promise.all(
    assetNames
      .filter((assetName) => assetName.endsWith('.js'))
      .map((assetName) => readFile(join(assetDirectory.pathname, assetName), 'utf8')),
  )
).join('\n');

const forbiddenRuntimeSignatures = [
  '/api/',
  'new WebSocket',
  'WebSocket(',
  'ws://',
  'wss://',
  'Orchestrator request timed out',
  'PREFERENCE_MCP_KEY',
];

for (const signature of forbiddenRuntimeSignatures) {
  if (javascript.includes(signature)) {
    throw new Error(`The Pages artifact contains a live-runtime signature: ${signature}`);
  }
}

console.log(
  `Verified GitHub Pages artifact: ${assetNames.filter((name) => name.endsWith('.js')).length} JavaScript assets, project base path, and no live-runtime signatures.`,
);
