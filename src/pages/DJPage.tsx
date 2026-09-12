import { Maximize, Radio, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { getMixer } from '../audio/engine/runtime';
import { DeckPanel } from '../components/dj/DeckPanel';
import { RhythmGame } from '../components/rhythm-game/RhythmGame';
import { Knob } from '../components/ui/Knob';
import { useMusicActions } from '../hooks/useMusicActions';
import { webPlatform } from '../platform/PlatformAdapter';
import { useAppStore } from '../stores/useAppStore';

export function DJPage() {
  const [tab, setTab] = useState('game');
  const notify = useAppStore((state) => state.notify);
  const crossfader = useAppStore((state) => state.crossfader);
  const volume = useAppStore((state) => state.masterVolume);
  const setCrossfader = useAppStore((state) => state.setCrossfader);
  const setVolume = useAppStore((state) => state.setMasterVolume);
  const { playDemo } = useMusicActions();
  const updateCrossfader = (value: number) => { setCrossfader(value); getMixer().setCrossfader(value); };
  const updateVolume = (value: number) => { setVolume(value); getMixer().setMasterVolume(value); };
  return (
    <section className="page dj-page" data-tab={tab}>
      <header className="dj-heading"><div><span><Radio /> PERFORMANCE MODE</span><h1>Music Universe DJ</h1><p>双 Deck 实时混音 · 本地低延迟音频链</p></div><div><button className="secondary-action" type="button" onClick={() => { void playDemo('A'); void playDemo('B'); }}><RotateCcw />载入双 Deck 示例</button><button className="icon-action" type="button" aria-label="全屏 DJ 台" onClick={() => void webPlatform.toggleFullscreen().catch(() => notify('当前浏览器不支持全屏，请使用放大音游'))}><Maximize /></button></div></header>
      <nav className="dj-mobile-tabs" aria-label="DJ 工作区">{[['a', 'Deck A'], ['game', '音游'], ['mixer', '混音器'], ['b', 'Deck B']].map(([value, label]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>
      <div className="dj-workspace"><DeckPanel id="A" /><RhythmGame /><DeckPanel id="B" /></div>
      <section className="master-mixer"><div className="master-label"><span>MASTER MIXER</span><small>EQUAL POWER CURVE</small></div><div className="crossfader"><b>A</b><input data-testid="crossfader" aria-label="交叉推子" type="range" min={-1} max={1} step={0.01} value={crossfader} onChange={(event) => updateCrossfader(Number(event.target.value))} /><b>B</b></div><div className="sync-controls"><button type="button" onClick={() => notify(getMixer().sync('A', 'B'))}>SYNC A → B</button><button type="button" onClick={() => notify(getMixer().sync('B', 'A'))}>SYNC B → A</button></div><Knob label="MASTER" value={Math.round(volume * 100)} min={0} max={100} unit="%" onChange={(value) => updateVolume(value / 100)} /></section>
    </section>
  );
}
