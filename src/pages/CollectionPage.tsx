import { Clock3, Heart, Moon, Play, Timer, TimerOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMusicActions } from '../hooks/useMusicActions';
import { formatRemaining, SLEEP_PRESETS, sleepRemaining } from '../library/collection';
import { useAppStore } from '../stores/useAppStore';
import { Artwork } from '../components/ui/Artwork';
import { ImportButton } from '../components/library/ImportButton';

/** Shared row markup for both lists, so they stay visually identical. */
function TrackRow({ track, index, onPlay, onFavorite }: {
  track: { id: string; title: string; artist: string; album: string; artwork?: Blob };
  index: number;
  onPlay: () => void;
  onFavorite?: () => void;
}) {
  // The play target and the heart are siblings, not nested: a button inside a
  // button is invalid and swallows the inner click in some browsers.
  return <div className="collection-row">
    <button className="collection-main" type="button" onClick={onPlay}>
      <b>{String(index + 1).padStart(2, '0')}</b>
      <Artwork artwork={track.artwork} />
      <span><strong>{track.title}</strong><small>{track.artist}</small></span>
      <em>{track.album}</em>
    </button>
    {onFavorite
      ? <button className="collection-heart" type="button" aria-label={`取消喜欢 ${track.title}`} onClick={onFavorite}><Heart size={15} fill="currentColor" /></button>
      : <i className="collection-play" aria-hidden="true"><Play size={14} /></i>}
  </div>;
}

export function CollectionPage() {
  const tracks = useAppStore((state) => state.tracks);
  const favorites = useAppStore((state) => state.favorites);
  const recent = useAppStore((state) => state.recent);
  const sleepEndsAt = useAppStore((state) => state.sleepEndsAt);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setSleepTimer = useAppStore((state) => state.setSleepTimer);
  const clearSleepTimer = useAppStore((state) => state.clearSleepTimer);
  const notify = useAppStore((state) => state.notify);
  const { loadTrack } = useMusicActions();
  const [now, setNow] = useState(() => Date.now());

  // Tick only while a timer is armed, so an idle page runs no interval at all.
  useEffect(() => {
    if (!sleepEndsAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [sleepEndsAt]);

  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const favoriteTracks = useMemo(() => favorites.map((id) => byId.get(id)).filter((track) => track !== undefined), [byId, favorites]);
  const recentTracks = useMemo(() => recent.map((id) => byId.get(id)).filter((track) => track !== undefined), [byId, recent]);
  const remaining = sleepRemaining(sleepEndsAt, now);

  return <section className="page collection-page">
    <header className="page-heading">
      <div><span>YOUR COLLECTION</span><h1>我的音乐</h1><p>{favoriteTracks.length} 首喜欢 · {recentTracks.length} 首最近播放 · 只保存在这台设备</p></div>
      <ImportButton />
    </header>

    <article className="sleep-card">
      <header>
        <Timer />
        <div>
          <h2>睡眠定时</h2>
          <p>{sleepEndsAt ? `还有 ${formatRemaining(remaining)} 自动暂停播放` : '到点后暂停两个 Deck，适合睡前听歌'}</p>
        </div>
      </header>
      <div className="sleep-options">
        {SLEEP_PRESETS.map((minutes) => <button key={minutes} className={sleepEndsAt && Math.abs(remaining - minutes * 60_000) < 30_000 ? 'active' : ''} type="button" onClick={() => { setSleepTimer(minutes); notify(`已设置 ${minutes} 分钟睡眠定时`); }}>{minutes} 分钟</button>)}
        {sleepEndsAt && <button type="button" className="sleep-cancel" onClick={() => { clearSleepTimer(); notify('已取消睡眠定时'); }}><TimerOff size={14} />取消</button>}
      </div>
    </article>

    <div className="collection-columns">
      <section data-testid="favorites-section">
        <header className="section-heading"><div><h2><Heart size={16} /> 喜欢的音乐</h2><p>点歌名播放，点心形取消喜欢。</p></div></header>
        {favoriteTracks.length
          ? <div className="collection-list">{favoriteTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} onPlay={() => void loadTrack(track.id)} onFavorite={() => toggleFavorite(track.id)} />)}</div>
          : <div className="collection-empty"><Heart /><span>还没有喜欢的音乐</span><small>在曲库里点每行的心形，就会出现在这里。</small></div>}
      </section>
      <section data-testid="recent-section">
        <header className="section-heading"><div><h2><Clock3 size={16} /> 最近播放</h2><p>按最近一次播放排序，重复播放会移到最前。</p></div></header>
        {recentTracks.length
          ? <div className="collection-list">{recentTracks.slice(0, 12).map((track, index) => <TrackRow key={track.id} track={track} index={index} onPlay={() => void loadTrack(track.id)} />)}</div>
          : <div className="collection-empty"><Moon /><span>最近还没有播放记录</span><small>播放任意一首音乐后，这里会记住你听过的顺序。</small></div>}
      </section>
    </div>
  </section>;
}
