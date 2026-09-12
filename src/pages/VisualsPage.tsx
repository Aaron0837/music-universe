import { Maximize, MousePointer2, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CanvasVisualizer, type CanvasVisualMode } from '../components/visualizers/CanvasVisualizer';
import { UniverseStage, type UniversePresetId } from '../components/visualizers/UniverseStage';
import { useMusicActions } from '../hooks/useMusicActions';
import { webPlatform } from '../platform/PlatformAdapter';

type VisualMode = CanvasVisualMode | UniversePresetId;
const universeIds = ['nebula', 'gravity', 'bloom', 'tunnel', 'aurora'] as const;
const isUniverse = (mode: VisualMode): mode is UniversePresetId => (universeIds as readonly string[]).includes(mode);
const visuals: Array<{ id: VisualMode; name: string; hint: string }> = [
  { id: 'orb', name: 'Orb', hint: '低频驱动球体呼吸' },
  { id: 'plasma', name: 'Plasma', hint: '流动的等离子光场' },
  { id: 'peak', name: 'Peak', hint: '精准频谱柱阵' },
  { id: 'waves', name: 'Waves', hint: '多层时域波浪' },
  { id: 'nebula', name: 'Nebula', hint: '星尘与云团' },
  { id: 'gravity', name: 'Gravity', hint: '指针引力场' },
  { id: 'bloom', name: 'Cyber Bloom', hint: '点击播种光芒' },
  { id: 'tunnel', name: 'Hyper Tunnel', hint: '低频撑开虫洞' },
  { id: 'aurora', name: 'Aurora Veil', hint: '中频涌动极光' },
];

export function VisualsPage() {
  const [mode, setMode] = useState<VisualMode>(() => visuals.find((item) => item.id === sessionStorage.getItem('mu-visual'))?.id ?? 'orb');
  const { playDemo } = useMusicActions();
  const selected = visuals.find((item) => item.id === mode)!;
  return <section className="page visuals-page"><header className="visual-heading"><div><span><Sparkles /> AUDIO REACTIVE</span><h1>看见音乐正在发生</h1><p>{selected.name} · {selected.hint}</p></div><div><button className="secondary-action" type="button" onClick={() => void playDemo()}><Play />播放示例</button><button className="icon-action" type="button" onClick={() => void webPlatform.toggleFullscreen()}><Maximize /></button></div></header><div className="visual-stage">{isUniverse(mode) ? <UniverseStage preset={mode} /> : <CanvasVisualizer mode={mode} />}<div className="visual-hud"><span><MousePointer2 />移动、拖动或点击画面</span><b>LIVE AUDIO</b></div></div><div className="visual-selector">{visuals.map((visual, index) => <button className={mode === visual.id ? 'active' : ''} type="button" key={visual.id} onClick={() => setMode(visual.id)}><span>0{index + 1}</span><strong>{visual.name}</strong><small>{visual.hint}</small></button>)}</div></section>;
}
