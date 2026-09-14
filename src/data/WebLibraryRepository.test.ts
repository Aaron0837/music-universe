import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeatGrid, Track } from '../types/models';
import { MusicDatabase, WebLibraryRepository } from './WebLibraryRepository';

// importFiles parses real audio through music-metadata. Mocking the parser lets a
// batch be driven from plain File objects — including a deliberately unreadable one.
const { parseBlob } = vi.hoisted(() => ({ parseBlob: vi.fn() }));
vi.mock('music-metadata', () => ({ parseBlob }));

/** Each test gets its own database so assertions never see another test's rows. */
let sequence = 0;
const openDatabases: MusicDatabase[] = [];
function makeRepository(): { repo: WebLibraryRepository; db: MusicDatabase } {
  const db = new MusicDatabase(`test-library-${++sequence}`);
  openDatabases.push(db);
  return { repo: new WebLibraryRepository(db), db };
}
afterEach(() => { openDatabases.splice(0).forEach((db) => db.close()); });

function makeTrack(id: string, extra: Partial<Track> = {}): Track {
  return { id, title: `T ${id}`, artist: 'A', album: 'Al', duration: 10, format: 'MP3', size: 100, addedAt: 1, ...extra };
}

function audioFile(name: string): File {
  return new File([new Uint8Array([0, 1, 2, 3])], name, { type: 'audio/mpeg' });
}

/** The shape importFiles needs: a title it can read, and no cover or lyrics. */
function metadataFor(file: File) {
  return { common: { title: file.name.replace(/\.[^.]+$/, '') }, format: { duration: 3, container: 'MP3' } };
}

beforeEach(() => {
  parseBlob.mockReset();
  parseBlob.mockImplementation(async (file: File) => metadataFor(file));
});

describe('settings', () => {
  it('round-trips values and reports a missing key as undefined', async () => {
    const { repo } = makeRepository();
    expect(await repo.getSetting('missing')).toBeUndefined();

    await repo.saveSetting('favorites', ['a', 'b']);
    await repo.saveSetting('playMode', 'shuffle');

    expect(await repo.getSetting<string[]>('favorites')).toEqual(['a', 'b']);
    expect(await repo.getSetting<string>('playMode')).toBe('shuffle');
  });

  it('overwrites an existing key rather than adding a second row', async () => {
    const { repo, db } = makeRepository();
    await repo.saveSetting('recent', ['a']);
    await repo.saveSetting('recent', ['b']);
    expect(await repo.getSetting<string[]>('recent')).toEqual(['b']);
    expect(await db.settings.count()).toBe(1);
  });
});

describe('playlists', () => {
  it('lists newest first', async () => {
    const { repo } = makeRepository();
    await repo.savePlaylist({ id: 'p1', name: 'Older', trackIds: [], createdAt: 1000 });
    await repo.savePlaylist({ id: 'p2', name: 'Newer', trackIds: [], createdAt: 2000 });
    expect((await repo.listPlaylists()).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('falls back to a default name when the given one is blank', async () => {
    const { repo } = makeRepository();
    const created = await repo.createPlaylist('   ');
    expect(created.name).toBe('新建歌单');
    expect(created.trackIds).toEqual([]);
    expect(created.id).toBeTruthy();
  });

  it('saves an edited playlist and removes one', async () => {
    const { repo } = makeRepository();
    const created = await repo.createPlaylist('List');
    await repo.savePlaylist({ ...created, name: 'Renamed', trackIds: ['t1', 't2'] });
    expect((await repo.listPlaylists())[0]).toMatchObject({ name: 'Renamed', trackIds: ['t1', 't2'] });

    await repo.removePlaylist(created.id);
    expect(await repo.listPlaylists()).toEqual([]);
  });
});

describe('lyrics', () => {
  it('stores text, clears it on blank input, and keeps hasLyrics in step', async () => {
    const { repo, db } = makeRepository();
    await db.tracks.add(makeTrack('t1'));

    await repo.saveLyrics('t1', '[00:01.00] hello');
    expect(await repo.getLyrics('t1')).toBe('[00:01.00] hello');
    expect((await db.tracks.get('t1'))?.hasLyrics).toBe(true);

    await repo.saveLyrics('t1', '   ');
    expect(await repo.getLyrics('t1')).toBeUndefined();
    expect((await db.tracks.get('t1'))?.hasLyrics).toBe(false);
  });

  it('refuses to write lyrics for a track that is not in the library', async () => {
    const { repo, db } = makeRepository();
    await repo.saveLyrics('ghost', 'text');
    expect(await db.lyrics.get('ghost')).toBeUndefined();
  });
});

describe('analysis cache', () => {
  const grid: BeatGrid = { bpm: 124, firstBeat: 0.5, confidence: 0.9, source: 'analysis', version: 1 };

  it('round-trips a current analysis', async () => {
    const { repo, db } = makeRepository();
    await db.tracks.add(makeTrack('t1'));
    await repo.saveAnalysis('t1', { grid, peaks: new Float32Array([0.5, 0.25]) });

    const stored = await repo.getAnalysis('t1');
    expect(stored?.grid?.bpm).toBe(124);
    expect(Array.from(stored!.peaks)).toEqual([0.5, 0.25]);
  });

  it('treats a record from an older format as absent so it gets recomputed', async () => {
    const { repo, db } = makeRepository();
    await db.tracks.add(makeTrack('t1'));
    await db.analyses.put({ trackId: 't1', grid, version: 0 });
    await db.waveforms.put({ trackId: 't1', peaks: new Float32Array([0.5]) });
    expect(await repo.getAnalysis('t1')).toBeUndefined();
  });

  it('needs both the grid and the waveform to report an analysis', async () => {
    const { repo, db } = makeRepository();
    await db.tracks.add(makeTrack('t1'));
    await db.analyses.put({ trackId: 't1', grid, version: 1 });
    expect(await repo.getAnalysis('t1')).toBeUndefined();
  });

  it('refuses to cache an analysis for a track that is not in the library', async () => {
    const { repo, db } = makeRepository();
    await repo.saveAnalysis('ghost', { grid, peaks: new Float32Array([0.5]) });
    expect(await db.analyses.get('ghost')).toBeUndefined();
  });
});

describe('removeTrack', () => {
  it('clears every table the track touched and leaves the others alone', async () => {
    const { repo, db } = makeRepository();
    await db.tracks.add(makeTrack('t1'));
    await db.audioBlobs.add({ trackId: 't1', blob: new Blob(['audio']) });
    await db.artworks.add({ trackId: 't1', blob: new Blob(['art']) });
    await db.waveforms.add({ trackId: 't1', peaks: new Float32Array([0.5]) });
    await db.analyses.add({ trackId: 't1', version: 1 });
    await db.lyrics.add({ trackId: 't1', text: 'words' });
    await db.tracks.add(makeTrack('t2'));

    await repo.removeTrack('t1');

    expect(await db.tracks.get('t1')).toBeUndefined();
    expect(await db.audioBlobs.get('t1')).toBeUndefined();
    expect(await db.artworks.get('t1')).toBeUndefined();
    expect(await db.waveforms.get('t1')).toBeUndefined();
    expect(await db.analyses.get('t1')).toBeUndefined();
    expect(await db.lyrics.get('t1')).toBeUndefined();
    expect(await db.tracks.get('t2')).toBeDefined();
  });
});

describe('importFiles', () => {
  it('keeps the readable files when one in the middle cannot be parsed', async () => {
    parseBlob.mockImplementation(async (file: File) => {
      if (file.name.startsWith('bad')) throw new Error('无法解析');
      return metadataFor(file);
    });
    const { repo, db } = makeRepository();

    const outcome = await repo.importFiles([audioFile('one.mp3'), audioFile('bad.mp3'), audioFile('three.mp3')]);

    expect(outcome.imported.map((t) => t.title)).toEqual(['one', 'three']);
    expect(outcome.failures).toEqual([{ name: 'bad.mp3', reason: '无法解析' }]);

    // The point of the whole change: the successful imports are really in the
    // database, so a caller that now always refreshes will show them.
    const stored = await repo.listTracks();
    expect(stored.map((t) => t.title).sort()).toEqual(['one', 'three']);
    for (const track of stored) expect(await db.audioBlobs.get(track.id)).toBeDefined();
  });

  it('reports an oversized file instead of aborting the batch', async () => {
    const { repo } = makeRepository();
    const oversized = audioFile('huge.mp3');
    Object.defineProperty(oversized, 'size', { value: 200 * 1024 * 1024 });

    const outcome = await repo.importFiles([oversized, audioFile('ok.mp3')]);

    expect(outcome.imported.map((t) => t.title)).toEqual(['ok']);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0].name).toBe('huge.mp3');
    expect(outcome.failures[0].reason).toContain('100 MB');
  });

  it('reports an empty input as an empty outcome', async () => {
    const { repo } = makeRepository();
    expect(await repo.importFiles([])).toEqual({ imported: [], failures: [] });
  });
});

describe('schema v3 → v4', () => {
  it('preserves library data while the unused indexes are dropped', async () => {
    const name = `test-migration-${++sequence}`;

    // Reproduce the historical v3 schema so the upgrade runs for real.
    class LegacyDatabase extends Dexie {
      constructor() {
        super(name);
        this.version(3).stores({
          tracks: 'id, title, artist, album, addedAt, bpm',
          audioBlobs: 'trackId',
          artworks: 'trackId',
          playlists: 'id, name, createdAt',
          waveforms: 'trackId',
          analyses: 'trackId, version',
          settings: 'key',
          lyrics: 'trackId',
        });
      }
    }
    const legacy = new LegacyDatabase();
    await legacy.open();
    await legacy.table('tracks').add(makeTrack('t1'));
    await legacy.table('audioBlobs').add({ trackId: 't1', blob: new Blob(['audio']) });
    await legacy.table('playlists').add({ id: 'p1', name: 'List', trackIds: ['t1'], createdAt: 5 });
    await legacy.table('settings').add({ key: 'playMode', value: 'shuffle' });
    expect(legacy.verno).toBe(3);
    legacy.close();

    // Open the same database with the current schema.
    const db = new MusicDatabase(name);
    openDatabases.push(db);
    const repo = new WebLibraryRepository(db);

    expect(db.verno).toBe(4);
    expect(await db.tracks.get('t1')).toBeDefined();
    expect(await repo.getTrack('t1')).toBeDefined();
    expect((await repo.listPlaylists()).map((p) => p.name)).toEqual(['List']);
    expect(await repo.getSetting('playMode')).toBe('shuffle');
    expect((await repo.listTracks()).map((t) => t.id)).toEqual(['t1']);
  });
});
