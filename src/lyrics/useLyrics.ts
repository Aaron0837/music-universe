import { useEffect, useState } from 'react';
import { libraryRepository } from '../data/WebLibraryRepository';
import { parseLrc, type Lyrics } from './lrc';

/** Lyrics are looked up once per track and cached; the parsing is pure. */
const cache = new Map<string, Lyrics | undefined>();

export interface LyricsState {
  lyrics?: Lyrics;
  /** True until the lookup for the current track settles. */
  loading: boolean;
}

/**
 * Load and parse the lyrics for a track.
 *
 * `trackId` is the deck's current track, which may be the built-in demo (no
 * library row) or undefined while a deck is empty; both resolve to "no lyrics"
 * rather than an error. Bump `revision` after saving lyrics to re-read them.
 */
export function useLyrics(trackId?: string, revision = 0): LyricsState {
  const [state, setState] = useState<LyricsState>(() => ({ lyrics: trackId ? cache.get(trackId) : undefined, loading: false }));

  useEffect(() => {
    if (!trackId) {
      setState({ lyrics: undefined, loading: false });
      return;
    }
    if (cache.has(trackId)) {
      setState({ lyrics: cache.get(trackId), loading: false });
      return;
    }
    let cancelled = false;
    setState({ lyrics: undefined, loading: true });
    void libraryRepository.getLyrics(trackId)
      .then((text) => {
        const parsed = text?.trim() ? parseLrc(text) : undefined;
        cache.set(trackId, parsed);
        if (!cancelled) setState({ lyrics: parsed, loading: false });
      })
      .catch(() => {
        // A library that cannot be read simply shows the no-lyrics state.
        if (!cancelled) setState({ lyrics: undefined, loading: false });
      });
    return () => { cancelled = true; };
  }, [trackId, revision]);

  return state;
}

/** Exposed so a newly saved lyric is picked up without a reload. */
export function invalidateLyricsCache(trackId?: string): void {
  if (trackId) cache.delete(trackId);
  else cache.clear();
}
