/**
 * Pure bookkeeping for the user's own marks on the library: favourites, play
 * history and the play mode. Kept free of storage and React so the rules
 * (newest first, no duplicates, bounded history) stay unit-testable.
 */

/** How many tracks the play history remembers. */
export const RECENT_LIMIT = 50;

/** Adds or removes a track from the favourites list, preserving order. */
export function toggleFavorite(favorites: readonly string[], trackId: string): string[] {
  if (!trackId) return [...favorites];
  return favorites.includes(trackId) ? favorites.filter((id) => id !== trackId) : [...favorites, trackId];
}

export function isFavorite(favorites: readonly string[], trackId?: string): boolean {
  return Boolean(trackId) && favorites.includes(trackId as string);
}

/**
 * Records a play, newest first.
 *
 * Replaying a track moves it to the front rather than adding a second entry, so
 * the history reads as "what I listened to" and not "how often I skipped back".
 */
export function addRecent(recent: readonly string[], trackId: string, limit = RECENT_LIMIT): string[] {
  if (!trackId || trackId === 'demo') return [...recent];
  return [trackId, ...recent.filter((id) => id !== trackId)].slice(0, Math.max(0, limit));
}

/** Drops ids that are no longer in the library, for both lists. */
export function pruneCollection(
  favorites: readonly string[],
  recent: readonly string[],
  available: readonly string[],
): { favorites: string[]; recent: string[] } {
  const known = new Set(available);
  return {
    favorites: favorites.filter((id) => known.has(id)),
    recent: recent.filter((id) => known.has(id)),
  };
}

/** Remaining sleep-timer milliseconds, floored at zero. */
export function sleepRemaining(endsAt: number | undefined, now: number): number {
  if (!endsAt) return 0;
  return Math.max(0, endsAt - now);
}

/** `37` → `37:00`, `95` → `1:35`; used by the sleep-timer countdown chip. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Sleep-timer lengths offered in the menu, in minutes. */
export const SLEEP_PRESETS = [15, 30, 45, 60] as const;
