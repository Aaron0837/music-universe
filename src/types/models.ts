export type DeckId = 'A' | 'B';
export type ThemeMode = 'light' | 'dark' | 'system';
export type AppView = 'discover' | 'library' | 'playlists' | 'collection' | 'dj' | 'visuals' | 'settings';

/**
 * How a queue advances past the track that just finished.
 * - `sequential` plays the list once and then stops
 * - `repeat-all` wraps back to the first entry
 * - `repeat-one` replays the current entry
 * - `shuffle` walks a random permutation, reshuffling only once it is exhausted
 */
export type PlayMode = 'sequential' | 'repeat-one' | 'repeat-all' | 'shuffle';

export interface BeatGrid {
  bpm: number;
  firstBeat: number;
  confidence: number;
  source: 'analysis' | 'manual' | 'demo';
  version: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  format: string;
  size: number;
  artwork?: Blob;
  bpm?: number;
  musicalKey?: string;
  genres?: string[];
  /** True when the file carried lyric text; the lyrics themselves live in their own table. */
  hasLyrics?: boolean;
  addedAt: number;
}

export interface StoredTrack extends Track {
  audio: Blob;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

/** The playlist currently playing on a deck, and how far it has got. */
export interface DeckQueue {
  trackIds: string[];
  deck: DeckId;
  index: number;
  /** Shuffle permutation of `trackIds` positions; only present in shuffle mode. */
  order?: number[];
}

export interface DeckSnapshot {
  trackId?: string;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  bpm: number;
  sourceBpm: number;
  keyShift: number;
  /** When on, tempo changes no longer move pitch; Harmony becomes a pure key change. */
  keyLock: boolean;
  /** Whether this browser can run the AudioWorklet that implements key lock. */
  keyLockAvailable: boolean;
  low: number;
  mid: number;
  high: number;
  filter: number;
  effects: { delay: number; reverb: number; flanger: number };
  loopBeats: number;
  loopEnabled: boolean;
  reverse: boolean;
  status: 'empty' | 'loading' | 'ready' | 'error';
  error?: string;
  grid?: BeatGrid;
  analysisPending: boolean;
  cues: Array<number | null>;
  revision: number;
}

export interface VisualizerFrame {
  frequencyBins: Uint8Array<ArrayBuffer>;
  timeDomain: Uint8Array<ArrayBuffer>;
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  beatPulse: number;
  bpm: number;
}
