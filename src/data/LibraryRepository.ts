import type { Playlist, StoredTrack, Track } from '../types/models';
import type { TrackAnalysis } from '../audio/analysis/beatAnalysis';

export interface LibraryRepository {
  importFiles(files: readonly File[]): Promise<Track[]>;
  listTracks(): Promise<Track[]>;
  getTrack(id: string): Promise<StoredTrack | undefined>;
  getAnalysis(id: string): Promise<TrackAnalysis | undefined>;
  saveAnalysis(id: string, analysis: TrackAnalysis): Promise<void>;
  removeTrack(id: string): Promise<void>;
  listPlaylists(): Promise<Playlist[]>;
  createPlaylist(name: string): Promise<Playlist>;
  savePlaylist(playlist: Playlist): Promise<void>;
  removePlaylist(id: string): Promise<void>;
  storage(): Promise<{ usage: number; quota: number; persistent: boolean }>;
  requestPersistence(): Promise<boolean>;
}
