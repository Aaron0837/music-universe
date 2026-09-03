import type { Playlist, StoredTrack, Track } from '../types/models';

export interface LibraryRepository {
  importFiles(files: readonly File[]): Promise<Track[]>;
  listTracks(): Promise<Track[]>;
  getTrack(id: string): Promise<StoredTrack | undefined>;
  removeTrack(id: string): Promise<void>;
  listPlaylists(): Promise<Playlist[]>;
  createPlaylist(name: string): Promise<Playlist>;
  savePlaylist(playlist: Playlist): Promise<void>;
  storage(): Promise<{ usage: number; quota: number; persistent: boolean }>;
  requestPersistence(): Promise<boolean>;
}
