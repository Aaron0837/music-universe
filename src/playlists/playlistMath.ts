/**
 * Pure playlist edits. Kept free of storage and React so the ordering rules
 * (dedupe on add, clamp on move, stop at the end) stay unit-testable.
 */
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

/** Drops ids that are no longer in the library, so playlists cannot hold ghosts. */
export function pruneMissing(trackIds: readonly string[], available: readonly string[]): string[] {
  const known = new Set(available);
  return trackIds.filter((id) => known.has(id));
}
