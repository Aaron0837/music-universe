import type { BeatGrid } from '../../types/models';

/** Align the target to the source's beat phase, preserving the closest target beat. */
export function syncPosition(sourcePosition: number, source: BeatGrid, targetPosition: number, target: BeatGrid): number {
  const beat = 60 / target.bpm;
  const phase = ((sourcePosition - source.firstBeat) / (60 / source.bpm) % 1 + 1) % 1;
  const targetBeat = (targetPosition - target.firstBeat) / beat;
  return Math.max(0, target.firstBeat + (Math.round(targetBeat - phase) + phase) * beat);
}
