import { ListMusic, Maximize2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { getMixer } from '../../audio/engine/runtime';
import { useMusicActions } from '../../hooks/useMusicActions';
import { PLAY_MODE_LABEL } from '../../playlists/playlistMath';
import { useAppStore } from '../../stores/useAppStore';
import { Artwork } from '../ui/Artwork';
import { Waveform } from './Waveform';

/** One icon per mode, so the transport button reads at a glance. */
const MODE_ICON = { sequential: Repeat, 'repeat-all': Repeat, 'repeat-one': Repeat1, shuffle: Shuffle } as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function PlayerDock() {
  const { playDemo, loadTrack } = useMusicActions();
  const tracks = useAppStore((state) => state.tracks);
  const activeDeck = useAppStore((state) => state.activeDeck);
  const deck = useAppStore((state) => state.decks[activeDeck]);
  const activeId = deck.trackId;
  const notify = useAppStore((state) => state.notify);
  const volume = useAppStore((state) => state.masterVolume);
  const setVolume = useAppStore((state) => state.setMasterVolume);
  const setNowPlaying = useAppStore((state) => state.setNowPlaying);
  const playMode = useAppStore((state) => state.playMode);
  const cyclePlayMode = useAppStore((state) => state.cyclePlayMode);
  const ModeIcon = MODE_ICON[playMode];
  const active = tracks.find((track) => track.id === activeId);
  const title = active?.title ?? (activeId === 'demo' ? 'Orbital Signal' : '准备播放');
  const artist = active?.artist ?? (activeId === 'demo' ? 'Music Universe Original' : '选择本地音乐或示例');
  const progress = deck.duration ? deck.position / deck.duration : 0;
  const toggle = async () => {
    if (!deck.trackId) return playDemo(activeDeck);
    try { await getMixer().decks[activeDeck].toggle(); } catch { notify('声音启动失败，请再次点击播放'); }
  };
  const updateVolume = (value: number) => {
    setVolume(value);
    getMixer().setMasterVolume(value);
  };
  const skip = (delta: number) => {
    if (!tracks.length) return;
    const index = tracks.findIndex((track) => track.id === activeId);
    void loadTrack(tracks[(Math.max(0, index) + delta + tracks.length) % tracks.length].id, activeDeck);
  };
  return (
    <footer className="player-dock">
      <button className="dock-track" type="button" aria-label="打开播放大屏" onClick={() => setNowPlaying(true)}><Artwork artwork={active?.artwork} /><div><strong>{title}</strong><small>{artist}</small></div><span className="dock-deck">DECK {activeDeck}</span><Maximize2 className="dock-expand" /></button>
      <div className="dock-transport">
        <div className="transport-buttons"><button type="button" aria-label="上一首" disabled={!tracks.length} onClick={() => skip(-1)}><SkipBack /></button><button className="play-main" type="button" aria-label="播放或暂停" onClick={() => void toggle()}>{deck.playing ? <Pause /> : <Play />}</button><button type="button" aria-label="下一首" disabled={!tracks.length} onClick={() => skip(1)}><SkipForward /></button><button className={`mode-button ${playMode}`} type="button" title={PLAY_MODE_LABEL[playMode]} aria-label={`播放模式：${PLAY_MODE_LABEL[playMode]}`} onClick={() => { cyclePlayMode(); notify(`播放模式：${PLAY_MODE_LABEL[useAppStore.getState().playMode]}`); }}><ModeIcon /></button></div>
        <div className="dock-progress"><span>{formatTime(deck.position)}</span><div><Waveform compact progress={progress} /><input aria-label="播放进度" type="range" min={0} max={deck.duration || 1} step={0.1} value={deck.position} onChange={(event) => getMixer().decks[activeDeck].seek(Number(event.target.value))} /></div><span>{formatTime(deck.duration)}</span></div>
      </div>
      <div className="dock-volume"><ListMusic size={18} /><Volume2 size={18} /><input aria-label="主音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} /></div>
    </footer>
  );
}
