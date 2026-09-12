/**
 * Pure playlist edits. Kept free of storage and React so the ordering rules
 * (dedupe on add, clamp on move, stop at the end) stay unit-testable.
 */
import type { PlayMode } from '../types/models';

export function addTrackToPlaylist(trackIds: readonly string[], trackId: string): string[] {
  if (!trackId || trackIds.includes(trackId)) return [...trackIds];
  return [...trackIds, trackId];
}

export function removeTrackFromPlaylist(trackIds: readonly string[], trackId: string): string[] {
  return trackIds.filter((id) => id !== trackId);
}

/** Moves one entry to a new position, clamped so a drag past either end still lands. */
export function moveTrack(trackIds: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= trackIds.length) return [...trackIds];
  const target = Math.max(0, Math.min(trackIds.length - 1, to));
  if (from === target) return [...trackIds];
  const next = [...trackIds];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Next queue position, or undefined when the playlist has run out. */
export function nextIndex(index: number, total: number): number | undefined {
  const next = index + 1;
  return next >= 0 && next < total ? next : undefined;
}

/**
 * Next position for the ordered modes. Shuffle walks its own permutation, so it
 * goes through `nextShuffleIndex` instead.
 *
 * `sequential` and the default keep the historical behaviour: run out, stop.
 */
export function nextQueueIndex(
  index: number,
  total: number,
  mode: Exclude<PlayMode, 'shuffle'> = 'sequential',
): number | undefined {
  if (total <= 0) return undefined;
  if (mode === 'repeat-one') return index >= 0 && index < total ? index : 0;
  if (mode === 'repeat-all') return index + 1 >= total ? 0 : index + 1;
  const next = index + 1;
  return next >= 0 && next < total ? next : undefined;
}

/** Fisher–Yates permutation of 0..total-1, driven by an injectable random source. */
export function shuffledOrder(total: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(0, total) }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    // Clamp so a custom `random` returning exactly 1 cannot index out of range.
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Where `index` sits in the shuffle order, or -1 when it is not part of it. */
export function orderPosition(order: readonly number[], index: number): number {
  return order.indexOf(index);
}

/**
 * Next entry in a shuffle order.
 *
 * Every track is played once before any repeats, because the order is only
 * rebuilt once it has been walked to the end. A fresh order never opens with the
 * track that just finished, which would otherwise look like a stuck repeat.
 */
export function nextShuffleIndex(
  order: readonly number[],
  index: number,
  total: number,
  random: () => number = Math.random,
): { index: number; order: number[] } {
  if (total <= 0) return { index: 0, order: [] };
  const position = orderPosition(order, index);
  if (position >= 0 && position + 1 < order.length) {
    return { index: order[position + 1], order: [...order] };
  }
  const fresh = shuffledOrder(total, random);
  if (fresh.length > 1 && fresh[0] === index) {
    [fresh[0], fresh[1]] = [fresh[1], fresh[0]];
  }
  return { index: fresh[0] ?? 0, order: fresh };
}

/** Human label for a mode, used by the transport button and its tooltip. */
export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  sequential: '顺序播放',
  'repeat-one': '单曲循环',
  'repeat-all': '列表循环',
  shuffle: '随机播放',
};

/** Cycles through the modes in the order the transport button offers them. */
export function nextPlayMode(mode: PlayMode): PlayMode {
  const order: PlayMode[] = ['sequential', 'repeat-all', 'repeat-one', 'shuffle'];
  return order[(order.indexOf(mode) + 1) % order.length];
}

/** Drops ids that are no longer in the library, so playlists cannot hold ghosts. */
export function pruneMissing(trackIds: readonly string[], available: readonly string[]): string[] {
  const known = new Set(available);
  return trackIds.filter((id) => known.has(id));
}
