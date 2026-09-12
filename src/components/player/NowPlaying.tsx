import { Mic2, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { peekMixer } from '../../audio/engine/runtime';
import { libraryRepository } from '../../data/WebLibraryRepository';
import { useMusicActions } from '../../hooks/useMusicActions';
import { activeLineIndex, lineProgress } from '../../lyrics/lrc';
import { invalidateLyricsCache, useLyrics } from '../../lyrics/useLyrics';
import { useAppStore } from '../../stores/useAppStore';
import { usePreferences } from '../../stores/usePreferences';
import { Artwork } from '../ui/Artwork';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

/**
 * Gate for the immersive player.
 *
 * The overlay subscribes to the per-frame deck snapshot, so mounting it
 * permanently would re-render five times a second for a hidden element. This
 * wrapper only watches the open flag and mounts the body on demand.
 */
export function NowPlaying() {
  const open = useAppStore((state) => state.nowPlaying);
  return open ? <NowPlayingOverlay /> : null;
}

function NowPlayingOverlay() {
  const setNowPlaying = useAppStore((state) => state.setNowPlaying);
  const activeDeck = useAppStore((state) => state.activeDeck);
  const deck = useAppStore((state) => state.decks[state.activeDeck]);
  const tracks = useAppStore((state) => state.tracks);
  const notify = useAppStore((state) => state.notify);
  const reduced = usePreferences((state) => state.reducedMotion);
  const { loadTrack } = useMusicActions();

  const track = tracks.find((item) => item.id === deck.trackId);
  // The built-in demo has no library row, so there is nothing to look lyrics up by.
  const lookupId = deck.trackId && deck.trackId !== 'demo' ? deck.trackId : undefined;
  const [revision, setRevision] = useState(0);
  const { lyrics, loading } = useLyrics(lookupId, revision);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const position = deck.position;
  const lines = lyrics?.lines ?? [];
  const synced = lyrics?.synced ?? false;
  const index = useMemo(() => (synced ? activeLineIndex(lines, position) : -1), [synced, lines, position]);
  const fill = synced ? lineProgress(lines, index, position, deck.duration) : 0;
  const playhead = deck.duration ? Math.min(1, position / deck.duration) : 0;

  // Keep the active line centred. Scrolling the container directly rather than
  // calling `scrollIntoView` avoids dragging the page behind the overlay.
  useEffect(() => {
    if (!synced || index < 0) return;
    const list = listRef.current;
    const line = activeRef.current;
    if (!list || !line) return;
    const top = line.offsetTop - list.clientHeight / 2 + line.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }, [index, synced, reduced]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editing) { setEditing(false); return; }
      setNowPlaying(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, setNowPlaying]);

  const seek = useCallback((time: number) => {
    const mixer = peekMixer();
    if (!mixer || !deck.trackId) return;
    mixer.decks[activeDeck].seek(Math.max(0, Math.min(deck.duration || time, time)));
  }, [activeDeck, deck.duration, deck.trackId]);

  const toggle = useCallback(async () => {
    const mixer = peekMixer();
    if (!mixer) return;
    try { await mixer.decks[activeDeck].toggle(); } catch { notify('播放失败，请再次点击并检查浏览器声音权限'); }
  }, [activeDeck, notify]);

  const skip = useCallback((delta: number) => {
    if (!tracks.length) return;
    const current = tracks.findIndex((item) => item.id === deck.trackId);
    const next = tracks[(Math.max(0, current) + delta + tracks.length) % tracks.length];
    void loadTrack(next.id, activeDeck);
  }, [activeDeck, deck.trackId, loadTrack, tracks]);

  const beginEdit = useCallback(async () => {
    // Read the stored text *before* revealing the editor. Opening it first would
    // let this assignment land after the user had already started typing and
    // silently wipe what they wrote.
    if (!lookupId) {
      setDraft('');
      setEditing(true);
      return;
    }
    const raw = await libraryRepository.getLyrics(lookupId).catch(() => undefined);
    // The deck may have moved on to another track while the read was in flight.
    if (useAppStore.getState().decks[useAppStore.getState().activeDeck].trackId !== lookupId) return;
    setDraft(raw ?? '');
    setEditing(true);
  }, [lookupId]);

  const save = useCallback(async () => {
    if (!lookupId) return;
    setSaving(true);
    try {
      await libraryRepository.saveLyrics(lookupId, draft);
      invalidateLyricsCache(lookupId);
      setRevision((value) => value + 1);
      setEditing(false);
      notify(draft.trim() ? '歌词已保存' : '歌词已清除');
    } catch {
      notify('歌词保存失败');
    } finally {
      setSaving(false);
    }
  }, [draft, lookupId, notify]);

  const title = track?.title ?? (deck.trackId === 'demo' ? 'Orbital Signal' : '准备播放');
  const artist = track?.artist ?? (deck.trackId === 'demo' ? 'Music Universe Original' : '选择本地音乐或示例');

  return <div className="now-playing" data-testid="now-playing" data-playing={deck.playing} data-synced={synced} role="dialog" aria-modal="true" aria-label="正在播放">
    <div className="np-backdrop" aria-hidden="true"><Artwork artwork={track?.artwork} className="np-backdrop-art" /></div>
    <header className="np-top">
      <span className="np-badge"><Mic2 size={14} />NOW PLAYING · DECK {activeDeck}</span>
      <button className="np-icon" type="button" aria-label="关闭播放大屏" onClick={() => setNowPlaying(false)}><X /></button>
    </header>
    <div className="np-body">
      <section className="np-art-column">
        <Artwork artwork={track?.artwork} className={`np-art ${deck.playing ? 'playing' : ''}`} />
        <div className="np-meta">
          <h2>{title}</h2>
          <p>{artist}</p>
          <span className="np-facts">{track?.album ?? '本机音频'}{track?.bpm ? ` · ${Math.round(track.bpm)} BPM` : ''}{synced ? ' · 逐行歌词' : ''}</span>
        </div>
      </section>
      <section className="np-lyric-column">
        {editing ? <div className="np-editor">
          <label htmlFor="np-lyric-input">粘贴 LRC 或纯文本歌词</label>
          <textarea id="np-lyric-input" aria-label="歌词文本" value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} placeholder="[00:12.30]第一句歌词" />
          <div className="np-editor-actions">
            <button className="primary-action" type="button" disabled={saving || !lookupId} onClick={() => void save()}>{saving ? '保存中' : '保存歌词'}</button>
            <button className="secondary-action" type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div> : <>
          <div className="np-lyric-head">
            <span>{synced ? 'VERSE · 时间轴歌词' : lyrics ? 'LYRICS · 纯文本' : 'LYRICS'}</span>
            {lookupId && <button className="np-text-button" type="button" onClick={() => void beginEdit()}>{lyrics ? '编辑歌词' : '添加歌词'}</button>}
          </div>
          {loading
            ? <p className="np-empty">正在读取歌词…</p>
            : lines.length
              ? <div className="np-lines" ref={listRef}>
                {lines.map((line, lineIndex) => lineIndex === index
                  ? <button key={`${line.time}-${lineIndex}`} ref={activeRef} type="button" className="np-line active" aria-current="true" onClick={() => seek(line.time)}>
                    <span className="np-line-text" style={{ ['--wipe' as string]: String(fill) }}>{line.text || '♪'}</span>
                  </button>
                  : <button key={`${line.time}-${lineIndex}`} type="button" className={`np-line ${lineIndex < index ? 'past' : 'future'}`} onClick={() => { if (synced) seek(line.time); }}>
                    <span className="np-line-text">{line.text || '♪'}</span>
                  </button>)}
              </div>
              : <p className="np-empty">这首曲目没有内嵌歌词{lookupId ? '，可以手动粘贴一份。' : '。'}</p>}
        </>}
      </section>
    </div>
    <footer className="np-controls">
      <div className="np-transport">
        <button className="np-icon" type="button" aria-label="上一首" disabled={!tracks.length} onClick={() => skip(-1)}><SkipBack /></button>
        <button className="np-play" type="button" aria-label="播放或暂停" onClick={() => void toggle()}>{deck.playing ? <Pause /> : <Play />}</button>
        <button className="np-icon" type="button" aria-label="下一首" disabled={!tracks.length} onClick={() => skip(1)}><SkipForward /></button>
      </div>
      <div className="np-seek">
        <span>{formatTime(position)}</span>
        <input aria-label="播放大屏进度" type="range" min={0} max={deck.duration || 1} step={0.1} value={position} onChange={(event) => seek(Number(event.target.value))} />
        <span>{deck.duration ? formatTime(deck.duration) : '--:--'}</span>
      </div>
      <span className="np-volume"><Volume2 size={16} />{Math.round(playhead * 100)}%</span>
    </footer>
  </div>;
}
