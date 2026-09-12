export type DeckId = 'A' | 'B';
export type ThemeMode = 'light' | 'dark' | 'system';
export type AppView = 'discover' | 'library' | 'playlists' | 'dj' | 'visuals' | 'settings';

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

export interface DeckSnapshot {
  trackId?: string;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  bpm: number;
  sourceBpm: number;
  keyShift: number;
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
