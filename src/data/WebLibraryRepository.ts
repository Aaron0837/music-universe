import Dexie, { type EntityTable } from 'dexie';
import type { Playlist, StoredTrack, Track } from '../types/models';
import type { ImportOutcome, LibraryRepository } from './LibraryRepository';
import type { BeatGrid } from '../types/models';
import type { TrackAnalysis } from '../audio/analysis/beatAnalysis';
import { lyricsTextFromCommon } from '../lyrics/lrc';

interface AudioRecord { trackId: string; blob: Blob }
interface ArtworkRecord { trackId: string; blob: Blob }
interface WaveformRecord { trackId: string; peaks: Float32Array<ArrayBuffer> }
interface AnalysisRecord { trackId: string; bpm?: number; grid?: BeatGrid; version: number }
interface SettingRecord { key: string; value: unknown }
interface LyricsRecord { trackId: string; text: string }

export class MusicDatabase extends Dexie {
  tracks!: EntityTable<Track, 'id'>;
  audioBlobs!: EntityTable<AudioRecord, 'trackId'>;
  artworks!: EntityTable<ArtworkRecord, 'trackId'>;
  playlists!: EntityTable<Playlist, 'id'>;
  waveforms!: EntityTable<WaveformRecord, 'trackId'>;
  analyses!: EntityTable<AnalysisRecord, 'trackId'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  lyrics!: EntityTable<LyricsRecord, 'trackId'>;

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
    // Lyrics live apart from the track row: a track carries lyrics rarely, and
    // keeping the text out of `tracks` means listing the library stays cheap.
    this.version(3).stores({ lyrics: 'trackId' });
    // Drop indexes nothing ever queries. `title`, `artist`, `album` and `bpm` were
    // declared for field search that never materialised — the library page filters
    // and sorts the loaded array in memory instead. `version` is read as a field,
    // never as a query key. IndexedDB maintains every index on every write, so
    // each unused one is pure cost on import. Removing indexes touches no data.
    this.version(4).stores({
      tracks: 'id, addedAt',
      playlists: 'id, createdAt',
      analyses: 'trackId',
    });
  }
}

export class WebLibraryRepository implements LibraryRepository {
  private readonly db: MusicDatabase;

  /** The database is injectable so tests can open an isolated, uniquely named one. */
  constructor(db: MusicDatabase = new MusicDatabase()) {
    this.db = db;
  }

  async importFiles(files: readonly File[]): Promise<ImportOutcome> {
    const { parseBlob } = await import('music-metadata');
    const imported: Track[] = [];
    const failures: ImportOutcome['failures'] = [];
    for (const file of files) {
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} 超过 100 MB 上限`);
        const estimate = await this.storage();
        if (estimate.quota > 0 && estimate.usage + file.size > estimate.quota * 0.9) {
          throw new Error(`存储空间不足，无法导入 ${file.name}`);
        }
        const metadata = await parseBlob(file, { duration: true, skipCovers: false });
        const picture = metadata.common.picture?.[0];
        const artwork = picture ? new Blob([new Uint8Array(picture.data)], { type: picture.format }) : undefined;
        const rawTitle = file.name.replace(/\.[^.]+$/, '');
        const lyrics = lyricsTextFromCommon(metadata.common as { lyrics?: unknown; syncLyrics?: unknown });
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
          hasLyrics: Boolean(lyrics?.trim()),
          addedAt: Date.now(),
        };
        await this.db.transaction('rw', this.db.tracks, this.db.audioBlobs, this.db.artworks, this.db.lyrics, async () => {
          await this.db.tracks.add(track);
          await this.db.audioBlobs.add({ trackId: track.id, blob: file });
          if (artwork) await this.db.artworks.add({ trackId: track.id, blob: artwork });
          if (lyrics?.trim()) await this.db.lyrics.add({ trackId: track.id, text: lyrics });
        });
        imported.push(track);
      } catch (error) {
        // One unreadable file must not cost the rest of the batch. The tracks that
        // did land are already committed, so reporting them is the only honest
        // outcome — throwing here is what used to hide them from the library page.
        failures.push({ name: file.name, reason: error instanceof Error ? error.message : '无法导入该音频' });
      }
    }
    return { imported, failures };
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
    await this.db.transaction('rw', [this.db.tracks, this.db.audioBlobs, this.db.artworks, this.db.waveforms, this.db.analyses, this.db.lyrics], async () => {
      await Promise.all([
        this.db.tracks.delete(id),
        this.db.audioBlobs.delete(id),
        this.db.artworks.delete(id),
        this.db.waveforms.delete(id),
        this.db.analyses.delete(id),
        this.db.lyrics.delete(id),
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

  async getLyrics(id: string): Promise<string | undefined> {
    return (await this.db.lyrics.get(id))?.text;
  }

  async saveLyrics(id: string, text: string): Promise<void> {
    await this.db.transaction('rw', this.db.tracks, this.db.lyrics, async () => {
      if (!await this.db.tracks.get(id)) return;
      if (text.trim()) await this.db.lyrics.put({ trackId: id, text });
      else await this.db.lyrics.delete(id);
      await this.db.tracks.update(id, { hasLyrics: Boolean(text.trim()) });
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

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.settings.get(key))?.value as T | undefined;
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    await this.db.settings.put({ key, value });
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
