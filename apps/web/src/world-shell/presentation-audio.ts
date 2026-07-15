import type { WorldPresentationCueKind } from '@signal-atlas/game-scene';

export const cueToneFrequency: Record<WorldPresentationCueKind, number> = {
  arrival: 440,
  work: 330,
  signal: 660,
  complete: 523.25,
  error: 220,
};

let context: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (typeof window === 'undefined' || !window.AudioContext) return undefined;
  context ??= new window.AudioContext();
  return context;
}

/** Acquire browser audio permission from the user's explicit sound-toggle gesture. */
export async function enablePresentationAudio(): Promise<void> {
  const activeContext = audioContext();
  if (activeContext?.state === 'suspended') await activeContext.resume();
}

/** Play a short synthesized cue after the user has explicitly enabled sound. */
export async function playPresentationTone(kind: WorldPresentationCueKind): Promise<void> {
  const activeContext = audioContext();
  if (!activeContext) return;
  if (activeContext.state === 'suspended') await enablePresentationAudio();
  const oscillator = activeContext.createOscillator();
  const gain = activeContext.createGain();
  const now = activeContext.currentTime;
  oscillator.type = kind === 'error' ? 'square' : 'sine';
  oscillator.frequency.setValueAtTime(cueToneFrequency[kind], now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  oscillator.connect(gain).connect(activeContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.18);
}
