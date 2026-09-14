import type { Playlist, StoredTrack, Track } from '../types/models';
import type { TrackAnalysis } from '../audio/analysis/beatAnalysis';

/**
 * Result of a batch import.
 *
 * A file that cannot be read is a normal outcome, not a failure of the import:
 * `failures` collects it and the remaining files still land. Infrastructure
 * faults (a closed database) are not represented here — they still throw.
 */
export interface ImportOutcome {
  imported: Track[];
  /** Per-file failures in input order, so the caller can report what was skipped. */
  failures: Array<{ name: string; reason: string }>;
}

export interface LibraryRepository {
  importFiles(files: readonly File[]): Promise<ImportOutcome>;
  listTracks(): Promise<Track[]>;
  getTrack(id: string): Promise<StoredTrack | undefined>;
  getAnalysis(id: string): Promise<TrackAnalysis | undefined>;
  saveAnalysis(id: string, analysis: TrackAnalysis): Promise<void>;
  /** Raw lyric text as stored in the file, or undefined when it has none. */
  getLyrics(id: string): Promise<string | undefined>;
  /** Replace a track's lyric text; an empty string clears it. */
  saveLyrics(id: string, text: string): Promise<void>;
  /** Small persisted preferences (favourites, history, play mode). */
  getSetting<T>(key: string): Promise<T | undefined>;
  saveSetting<T>(key: string, value: T): Promise<void>;
  removeTrack(id: string): Promise<void>;
  listPlaylists(): Promise<Playlist[]>;
  createPlaylist(name: string): Promise<Playlist>;
  savePlaylist(playlist: Playlist): Promise<void>;
  removePlaylist(id: string): Promise<void>;
  storage(): Promise<{ usage: number; quota: number; persistent: boolean }>;
  requestPersistence(): Promise<boolean>;
}
