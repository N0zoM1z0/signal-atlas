import type { Agent } from '@signal-atlas/contracts';

export const agentSpriteStates = ['idle', 'walk', 'work', 'share'] as const;
export type AgentSpriteState = (typeof agentSpriteStates)[number];

export const agentSpriteFrameCounts = {
  idle: 2,
  walk: 4,
  work: 3,
  share: 3,
} as const satisfies Record<AgentSpriteState, number>;

export function agentSpriteStateForPublicState(
  publicState: Agent['publicState'],
): AgentSpriteState {
  switch (publicState) {
    case 'traveling':
      return 'walk';
    case 'working':
      return 'work';
    case 'meeting':
      return 'share';
    case 'idle':
    case 'error':
      return 'idle';
  }
}

export function agentAnimationKey(agentId: string, state: AgentSpriteState): string {
  return `signal-atlas:${agentId}:${state}`;
}

export function agentTextureKey(agentId: string, state: AgentSpriteState, frame: number): string {
  if (!Number.isInteger(frame) || frame < 0 || frame >= agentSpriteFrameCounts[state]) {
    throw new RangeError(`Frame ${frame} is outside the ${state} animation for ${agentId}.`);
  }
  return `${agentAnimationKey(agentId, state)}:${frame}`;
}
