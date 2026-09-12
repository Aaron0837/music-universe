import { Pause, Play, Rewind } from 'lucide-react';
import { useRef } from 'react';
import { getMixer } from '../../audio/engine/runtime';
import { audibleBpm } from '../../audio/keylock/keyLockMath';
import { useAppStore } from '../../stores/useAppStore';
import { useMusicActions } from '../../hooks/useMusicActions';
import type { DeckId } from '../../types/models';
import { Artwork } from '../ui/Artwork';
import { Knob } from '../ui/Knob';
import { Waveform } from '../player/Waveform';

export function DeckPanel({ id }: { id: DeckId }) {
  const deck = useAppStore((state) => state.decks[id]);
  const tracks = useAppStore((state) => state.tracks);
  const notify = useAppStore((state) => state.notify);
  const effects = deck.effects;
  const dragX = useRef<number | undefined>(undefined), taps = useRef<number[]>([]);
  const { loadTrack } = useMusicActions();
  const track = tracks.find((item) => item.id === deck.trackId);
  const engine = () => getMixer().decks[id];
  const tap = () => {
    const now = performance.now();
    if (now - (taps.current.at(-1) ?? 0) > 1800) taps.current = [];
    taps.current.push(now); if (taps.current.length > 8) taps.current.shift();
    if (taps.current.length >= 3) engine().setSourceBpm(60000 * (taps.current.length - 1) / (now - taps.current[0]) / engine().playbackRate);
  };
  const effect = (name: keyof typeof effects, value: number) => {
    engine().setEffect(name, value);
  };
  return <article className={`deck-panel deck-panel--${id.toLowerCase()}`} data-testid={`deck-${id.toLowerCase()}`}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const trackId = event.dataTransfer.getData('application/x-music-track'); if (tracks.some((item) => item.id === trackId)) { event.preventDefault(); event.stopPropagation(); void loadTrack(trackId, id); } }}>
    <header><span>DECK {id}</span><i>{deck.status.toUpperCase()}</i><b>{audibleBpm({ keyLock: deck.keyLock, bpm: deck.bpm, keyShift: deck.keyShift }).toFixed(1)} BPM</b></header>
    <div className="deck-main">
      <button className={`vinyl ${deck.playing ? 'spinning' : ''}`} type="button" aria-label={`搓碟 ${id}`}
        onPointerDown={(event) => { dragX.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (dragX.current !== undefined) { engine().scratch((event.clientX - dragX.current) / 90); dragX.current = event.clientX; } }}
        onPointerUp={() => { dragX.current = undefined; }} onPointerCancel={() => { dragX.current = undefined; }}>
        <span /><Artwork artwork={track?.artwork} /><b>{id}</b>
      </button>
      <div className="deck-track"><small>{track?.artist ?? 'MUSIC UNIVERSE ORIGINAL'}</small><strong>{track?.title ?? (deck.trackId === 'demo' ? 'Orbital Signal' : '等待载入音乐')}</strong>
        <select aria-label={`为 Deck ${id} 选曲`} value={track?.id ?? ''} onChange={(event) => { if (event.target.value) void loadTrack(event.target.value, id); }}>
          <option value="">从本地曲库选曲</option>{tracks.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
        </select></div>
    </div>
    <div className="deck-wave"><Waveform deckId={id} progress={deck.duration ? deck.position / deck.duration : 0} />
      <input aria-label={`Deck ${id} 进度`} type="range" min={0} max={deck.duration || 1} step={0.01} value={deck.position} onChange={(event) => engine().seek(Number(event.target.value))} /></div>
    <div className="deck-primary-controls"><Knob large label="BPM" value={deck.bpm} min={60} max={200} step={0.1} unit="TEMPO" onChange={(value) => engine().setTempo(value)} /><Knob large label="VOLUME" value={Math.round(deck.volume * 100)} min={0} max={100} unit="%" onChange={(value) => engine().setVolume(value / 100)} /></div>
    <p className="rate-note">{deck.keyLock ? '保调变速已开启 · BPM 不改变音高，Harmony 是纯调性移调' : 'BPM 与 Harmony 联动音高和速度 · 开启保调变速可分离'}</p>
    <details className="beat-calibration"><summary>{deck.analysisPending ? '正在后台分析拍点…' : deck.grid ? `拍点 · ${deck.grid.source === 'manual' ? '手动校准' : `${Math.round(deck.grid.confidence * 100)}% 置信度`}` : '拍点未确定 · 点击校准'}</summary>
      <label>原曲 BPM<input aria-label={`Deck ${id} 原曲 BPM`} type="number" min={60} max={200} step={0.1} value={Number(deck.sourceBpm.toFixed(1))} onChange={(event) => engine().setSourceBpm(Number(event.target.value))} /></label>
      <button type="button" onClick={tap}>TAP TEMPO</button><button type="button" onClick={() => engine().setFirstBeat()}>当前位置设为首拍</button>
    </details>
    {deck.error && <p role="alert" className="rate-note">{deck.error}</p>}
    <div className="eq-row">{(['low', 'mid', 'high'] as const).map((band) => <Knob key={band} label={band.toUpperCase()} value={Math.round(deck[band])} min={-24} max={12} unit="dB" onChange={(value) => engine().setEq(band, value)} />)}<Knob label="HARMONY" value={deck.keyShift} min={-12} max={12} unit="ST" onChange={(value) => engine().setKey(value)} /></div>
    <button type="button" className={`key-lock-toggle ${deck.keyLock ? 'active' : ''}`} aria-pressed={deck.keyLock} aria-label={`Deck ${id} 保调变速`} disabled={!deck.keyLockAvailable} onClick={() => { void engine().setKeyLock(!deck.keyLock).catch((error: Error) => notify(error.message)); }}>KEY LOCK<small>{deck.keyLock ? '保调开启' : deck.keyLockAvailable ? '点击开启' : '不可用'}</small></button>
    <label className="filter-slider">FILTER<input aria-label={`Deck ${id} 滤波`} type="range" min={0} max={1} step={0.01} value={deck.filter} onChange={(event) => engine().setFilter(Number(event.target.value))} /></label>
    <div className="fx-grid">{(['delay', 'reverb', 'flanger'] as const).map((name) => <label key={name}>{name.toUpperCase()}<input aria-label={`Deck ${id} ${name}`} type="range" min={0} max={0.8} step={0.01} value={effects[name]} onChange={(event) => effect(name, Number(event.target.value))} /></label>)}</div>
    <div className="cue-row">{deck.cues.map((cue, index) => <button key={index} type="button" className={cue !== null ? 'active' : ''} title="首次点击设点，再次点击跳转；Shift+点击清除" onClick={(event) => { if (event.shiftKey) engine().clearCue(index); else if (cue === null) engine().setCue(index); else engine().jumpCue(index); }}>CUE {index + 1}<small>{cue === null ? '设点' : `${cue.toFixed(1)}s`}</small></button>)}</div>
    <div className="deck-performance"><select aria-label={`Deck ${id} 循环拍数`} value={deck.loopBeats} onChange={(event) => engine().setLoop(Number(event.target.value), deck.loopEnabled)}>{[1, 2, 4, 8].map((beats) => <option key={beats} value={beats}>{beats} 拍</option>)}</select>
      <button className={deck.loopEnabled ? 'active' : ''} type="button" onClick={() => engine().setLoop(deck.loopBeats, !deck.loopEnabled)}>LOOP</button>
      <button aria-label={`Deck ${id} 倒放`} className={deck.reverse ? 'active' : ''} type="button" onClick={() => engine().setReverse(!deck.reverse)}><Rewind /></button>
      <button className="deck-play" aria-label={`Deck ${id} 播放暂停`} type="button" onClick={() => { useAppStore.getState().setActiveDeck(id); void engine().toggle().catch(() => notify('请再次点击播放以启用声音')); }}>{deck.playing ? <Pause /> : <Play />}</button></div>
  </article>;
}
