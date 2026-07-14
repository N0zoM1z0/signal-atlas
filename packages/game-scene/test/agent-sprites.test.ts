import { describe, expect, it } from 'vitest';

import {
  agentAnimationKey,
  agentSpriteFrameCounts,
  agentSpriteStateForPublicState,
  agentSpriteStates,
  agentTextureKey,
} from '../src/agent-sprites.js';

describe('agent sprite definitions', () => {
  it('maps every public agent state onto the bounded visual vocabulary', () => {
    expect(agentSpriteStateForPublicState('idle')).toBe('idle');
    expect(agentSpriteStateForPublicState('traveling')).toBe('walk');
    expect(agentSpriteStateForPublicState('working')).toBe('work');
    expect(agentSpriteStateForPublicState('meeting')).toBe('share');
    expect(agentSpriteStateForPublicState('error')).toBe('idle');
  });

  it('defines complete, collision-free frame keys for every agent and state', () => {
    const keys = ['mira', 'orin', 'kestrel'].flatMap((agentId) =>
      agentSpriteStates.flatMap((state) =>
        Array.from({ length: agentSpriteFrameCounts[state] }, (_, frame) =>
          agentTextureKey(agentId, state, frame),
        ),
      ),
    );

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(36);
    expect(agentAnimationKey('mira', 'share')).toBe('signal-atlas:mira:share');
    expect(() => agentTextureKey('mira', 'walk', 4)).toThrow(RangeError);
  });
});
