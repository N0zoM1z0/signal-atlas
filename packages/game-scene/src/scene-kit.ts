import type { WorldSceneDefinition } from './types.js';

export const worldSceneLandmarkKinds = [
  'launch_vehicle',
  'harbor_beacon',
  'civic_tower',
  'wayfinder',
] as const;

export type WorldSceneLandmarkKind = (typeof worldSceneLandmarkKinds)[number];

/**
 * Selects presentation art from authored world metadata only.
 *
 * Market questions and expedition IDs are intentionally excluded: a scenario may reuse a
 * visual template without inheriting another scenario's domain assumptions.
 */
export function landmarkKindForScene(
  scene: Pick<WorldSceneDefinition, 'assetPack' | 'template'>,
): WorldSceneLandmarkKind {
  if (scene.assetPack.startsWith('helios3-') || scene.template === 'science-space-launch') {
    return 'launch_vehicle';
  }
  if (scene.assetPack.startsWith('northlight-harbor-') || scene.template === 'coastal-harbor') {
    return 'harbor_beacon';
  }
  if (
    scene.assetPack.startsWith('northbridge-ledger-') ||
    scene.template === 'ledger-civic-industrial'
  ) {
    return 'civic_tower';
  }
  return 'wayfinder';
}
