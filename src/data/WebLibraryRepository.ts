import Dexie, { type EntityTable } from 'dexie';
import type { Playlist, StoredTrack, Track } from '../types/models';
import type { LibraryRepository } from './LibraryRepository';
import type { BeatGrid } from '../types/models';
import type { TrackAnalysis } from '../audio/analysis/beatAnalysis';

interface AudioRecord { trackId: string; blob: Blob }
interface ArtworkRecord { trackId: string; blob: Blob }
interface WaveformRecord { trackId: string; peaks: Float32Array<ArrayBuffer> }
interface AnalysisRecord { trackId: string; bpm?: number; musicalKey?: string; grid?: BeatGrid; version: number }
interface SettingRecord { key: string; value: unknown }

export class MusicDatabase extends Dexie {
  tracks!: EntityTable<Track, 'id'>;
  audioBlobs!: EntityTable<AudioRecord, 'trackId'>;
  artworks!: EntityTable<ArtworkRecord, 'trackId'>;
  playlists!: EntityTable<Playlist, 'id'>;
  waveforms!: EntityTable<WaveformRecord, 'trackId'>;
  analyses!: EntityTable<AnalysisRecord, 'trackId'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor(name = 'music-universe-library') {
    super(name);
    this.version(1).stores({
      tracks: 'id, title, artist, album, addedAt, bpm',
      audioBlobs: 'trackId',
      artworks: 'trackId',
      playlists: 'id, name, createdAt',
      waveforms: 'trackId',
      analyses: 'trackId, version',
      settings: 'key',
    });
    // Add a versioned grid without deleting legacy tracks, blobs or playlists.
    this.version(2).stores({ analyses: 'trackId, version' }).upgrade(async (transaction) => {
      await transaction.table('analyses').toCollection().modify((record) => { record.version = 0; });
    });
  }
}

export class WebLibraryRepository implements LibraryRepository {
  private readonly db = new MusicDatabase();

  async importFiles(files: readonly File[]): Promise<Track[]> {
    const { parseBlob } = await import('music-metadata');
    const imported: Track[] = [];
    for (const file of files) {
      if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} 超过 100 MB 上限`);
      const estimate = await this.storage();
      if (estimate.quota > 0 && estimate.usage + file.size > estimate.quota * 0.9) {
        throw new Error(`存储空间不足，无法导入 ${file.name}`);
      }
      const metadata = await parseBlob(file, { duration: true, skipCovers: false });
      const picture = metadata.common.picture?.[0];
      const artwork = picture ? new Blob([new Uint8Array(picture.data)], { type: picture.format }) : undefined;
      const rawTitle = file.name.replace(/\.[^.]+$/, '');
      const track: Track = {
        id: crypto.randomUUID(),
        title: metadata.common.title?.trim() || rawTitle,
        artist: metadata.common.artist?.trim() || '未知艺术家',
        album: metadata.common.album?.trim() || '本地音乐',
        duration: metadata.format.duration ?? 0,
        format: metadata.format.container ?? (file.type || file.name.split('.').pop()?.toUpperCase() || 'AUDIO'),
        size: file.size,
        artwork,
        bpm: metadata.common.bpm,
        genres: metadata.common.genre,
        addedAt: Date.now(),
      };
      await this.db.transaction('rw', this.db.tracks, this.db.audioBlobs, this.db.artworks, async () => {
        await this.db.tracks.add(track);
        await this.db.audioBlobs.add({ trackId: track.id, blob: file });
        if (artwork) await this.db.artworks.add({ trackId: track.id, blob: artwork });
      });
      imported.push(track);
    }
    return imported;
  }

  async listTracks(): Promise<Track[]> {
    return this.db.tracks.orderBy('addedAt').reverse().toArray();
  }

  async getTrack(id: string): Promise<StoredTrack | undefined> {
    const [track, audio, artwork] = await Promise.all([
      this.db.tracks.get(id),
      this.db.audioBlobs.get(id),
      this.db.artworks.get(id),
    ]);
    if (!track || !audio) return undefined;
    return { ...track, artwork: artwork?.blob, audio: audio.blob };
  }

  async removeTrack(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.tracks, this.db.audioBlobs, this.db.artworks, this.db.waveforms, this.db.analyses, async () => {
      await Promise.all([
        this.db.tracks.delete(id),
        this.db.audioBlobs.delete(id),
        this.db.artworks.delete(id),
        this.db.waveforms.delete(id),
        this.db.analyses.delete(id),
      ]);
    });
  }

  async getAnalysis(id: string): Promise<TrackAnalysis | undefined> {
    const [analysis, waveform] = await Promise.all([this.db.analyses.get(id), this.db.waveforms.get(id)]);
    return analysis?.version === 1 && waveform ? { grid: analysis.grid, peaks: waveform.peaks } : undefined;
  }

  async saveAnalysis(id: string, analysis: TrackAnalysis): Promise<void> {
    await this.db.transaction('rw', this.db.tracks, this.db.analyses, this.db.waveforms, async () => {
      if (!await this.db.tracks.get(id)) return;
      await this.db.analyses.put({ trackId: id, grid: analysis.grid, bpm: analysis.grid?.bpm, version: 1 });
      await this.db.waveforms.put({ trackId: id, peaks: analysis.peaks });
    });
  }

  async listPlaylists(): Promise<Playlist[]> {
    return this.db.playlists.orderBy('createdAt').reverse().toArray();
  }

  async createPlaylist(name: string): Promise<Playlist> {
    const playlist = { id: crypto.randomUUID(), name: name.trim() || '新建歌单', trackIds: [], createdAt: Date.now() };
    await this.db.playlists.add(playlist);
    return playlist;
  }

  async savePlaylist(playlist: Playlist): Promise<void> {
    await this.db.playlists.put(playlist);
  }

  async removePlaylist(id: string): Promise<void> {
    await this.db.playlists.delete(id);
  }

  async storage(): Promise<{ usage: number; quota: number; persistent: boolean }> {
    const estimate = await navigator.storage?.estimate?.();
    const persistent = await navigator.storage?.persisted?.() ?? false;
    return { usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0, persistent };
  }

  async requestPersistence(): Promise<boolean> {
    return navigator.storage?.persist?.() ?? false;
  }
}

export const libraryRepository: LibraryRepository = new WebLibraryRepository();
