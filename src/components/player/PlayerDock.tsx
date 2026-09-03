import { Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { getMixer } from '../../audio/engine/runtime';
import { useMusicActions } from '../../hooks/useMusicActions';
import { useAppStore } from '../../stores/useAppStore';
import { Artwork } from '../ui/Artwork';
import { Waveform } from './Waveform';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function PlayerDock() {
  const { playDemo } = useMusicActions();
  const tracks = useAppStore((state) => state.tracks);
  const activeId = useAppStore((state) => state.activeTrackId);
  const deck = useAppStore((state) => state.decks.A);
  const volume = useAppStore((state) => state.masterVolume);
  const setVolume = useAppStore((state) => state.setMasterVolume);
  const active = tracks.find((track) => track.id === activeId);
  const title = active?.title ?? (activeId === 'demo' ? 'Orbital Signal' : '准备播放');
  const artist = active?.artist ?? (activeId === 'demo' ? 'Music Universe Original' : '选择本地音乐或示例');
  const progress = deck.duration ? deck.position / deck.duration : 0;
  const toggle = async () => {
    if (!deck.trackId) return playDemo();
    await getMixer().decks.A.toggle();
  };
  const updateVolume = (value: number) => {
    setVolume(value);
    getMixer().setMasterVolume(value);
  };
  return (
    <footer className="player-dock">
      <div className="dock-track"><Artwork artwork={active?.artwork} /><div><strong>{title}</strong><small>{artist}</small></div><button type="button" aria-label="喜欢"><Heart size={18} /></button></div>
      <div className="dock-transport">
        <div className="transport-buttons"><button type="button" aria-label="上一首"><SkipBack /></button><button className="play-main" type="button" aria-label="播放或暂停" onClick={() => void toggle()}>{deck.playing ? <Pause /> : <Play />}</button><button type="button" aria-label="下一首"><SkipForward /></button></div>
        <div className="dock-progress"><span>{formatTime(deck.position)}</span><div><Waveform compact progress={progress} /><input aria-label="播放进度" type="range" min={0} max={deck.duration || 1} step={0.1} value={deck.position} onChange={(event) => getMixer().decks.A.seek(Number(event.target.value))} /></div><span>{formatTime(deck.duration)}</span></div>
      </div>
      <div className="dock-volume"><ListMusic size={18} /><Volume2 size={18} /><input aria-label="主音量" type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} /></div>
    </footer>
  );
}
