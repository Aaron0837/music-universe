import { Gauge, Pause, Play, Rewind, RotateCcw, SlidersHorizontal, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { getMixer } from '../../audio/engine/runtime';
import { useAppStore } from '../../stores/useAppStore';
import type { DeckId } from '../../types/models';
import { Artwork } from '../ui/Artwork';
import { Knob } from '../ui/Knob';
import { Waveform } from '../player/Waveform';

export function DeckPanel({ id }: { id: DeckId }) {
  const deck = useAppStore((state) => state.decks[id]);
  const tracks = useAppStore((state) => state.tracks);
  const [effects, setEffects] = useState({ delay: 0, reverb: 0, flanger: 0 });
  const [cue, setCue] = useState(0);
  const dragX = useRef<number | undefined>(undefined);
  const track = tracks.find((item) => item.id === deck.trackId);
  const engine = () => getMixer().decks[id];
  const effect = (name: keyof typeof effects, value: number) => {
    setEffects((current) => ({ ...current, [name]: value }));
    engine().setEffect(name, value);
  };
  const scratchMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragX.current === undefined) return;
    const delta = (event.clientX - dragX.current) / 90;
    dragX.current = event.clientX;
    engine().scratch(delta);
  };
  return (
    <article className={`deck-panel deck-panel--${id.toLowerCase()}`} data-testid={`deck-${id.toLowerCase()}`}>
      <header><span>DECK {id}</span><i>{deck.trackId ? 'READY' : 'EMPTY'}</i><b>{deck.bpm.toFixed(1)} BPM</b></header>
      <div className="deck-main">
        <button className={`vinyl ${deck.playing ? 'spinning' : ''}`} type="button" aria-label={`搓碟 ${id}`} onPointerDown={(event) => { dragX.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={scratchMove} onPointerUp={() => { dragX.current = undefined; }}>
          <span /><i /><Artwork artwork={track?.artwork} /><b>{id}</b>
        </button>
        <div className="deck-track"><small>{track ? track.artist : 'DROP A TRACK'}</small><strong>{track?.title ?? '等待载入音乐'}</strong><span>{track?.album ?? '从曲库拖入 Deck'}</span></div>
      </div>
      <Waveform progress={deck.duration ? deck.position / deck.duration : 0} />
      <div className="deck-primary-controls"><Knob large label="BPM" value={deck.bpm} min={60} max={200} step={0.1} unit="TEMPO" onChange={(value) => engine().setTempo(value)} /><Knob large label="VOLUME" value={Math.round(deck.volume * 100)} min={0} max={100} unit="%" onChange={(value) => engine().setVolume(value / 100)} /></div>
      <div className="eq-row"><Knob label="LOW" value={Math.round(deck.low)} min={-24} max={12} unit="dB" onChange={(value) => engine().setEq('low', value)} /><Knob label="MID" value={Math.round(deck.mid)} min={-24} max={12} unit="dB" onChange={(value) => engine().setEq('mid', value)} /><Knob label="HIGH" value={Math.round(deck.high)} min={-24} max={12} unit="dB" onChange={(value) => engine().setEq('high', value)} /><Knob label="HARMONY" value={deck.keyShift} min={-12} max={12} unit="ST" onChange={(value) => engine().setKey(value)} /></div>
      <label className="filter-slider"><SlidersHorizontal size={15} /><span>FILTER</span><input type="range" min={0} max={1} step={0.01} value={deck.filter} onChange={(event) => engine().setFilter(Number(event.target.value))} /></label>
      <div className="fx-grid"><label>DELAY<input type="range" min={0} max={0.8} step={0.01} value={effects.delay} onChange={(event) => effect('delay', Number(event.target.value))} /></label><label>REVERB<input type="range" min={0} max={0.8} step={0.01} value={effects.reverb} onChange={(event) => effect('reverb', Number(event.target.value))} /></label><label>FLANGER<input type="range" min={0} max={0.8} step={0.01} value={effects.flanger} onChange={(event) => effect('flanger', Number(event.target.value))} /></label></div>
      <div className="deck-performance"><button type="button" onClick={() => { setCue(deck.position); }}><Zap />HOT CUE</button><button type="button" onClick={() => engine().seek(cue)}><RotateCcw />CUE</button><button className={deck.loopEnabled ? 'active' : ''} type="button" onClick={() => engine().setLoop(deck.loopBeats, !deck.loopEnabled)}><Gauge />LOOP {deck.loopBeats}</button><button className={deck.reverse ? 'active' : ''} type="button" onClick={() => engine().setReverse(!deck.reverse)}><Rewind />REVERSE</button><button className="deck-play" type="button" onClick={() => void engine().toggle()}>{deck.playing ? <Pause /> : <Play />}</button></div>
    </article>
  );
}
