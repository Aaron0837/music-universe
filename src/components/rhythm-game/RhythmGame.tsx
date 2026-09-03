import { Maximize2, Pause, Play, Trophy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMixer } from '../../audio/engine/runtime';

interface Note { id: number; lane: number; target: number }
type GameMode = 'bpm' | 'drums' | 'harmony';
const keys = ['A', 'S', 'D', 'F'];

export function RhythmGame() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<GameMode>('drums');
  const [notes, setNotes] = useState<Note[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [callout, setCallout] = useState('READY');
  const [pulse, setPulse] = useState(false);
  const [clock, setClock] = useState(() => performance.now());
  const idRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    setNotes([]);
    const interval = window.setInterval(() => {
      const bpm = getMixer().decks.A.currentBpm;
      const target = performance.now() + Math.max(820, 60000 / bpm * 2.2);
      setNotes((current) => [...current.filter((note) => note.target > performance.now() - 220), { id: idRef.current++, lane: idRef.current % 4, target }]);
    }, 60000 / Math.max(90, getMixer().decks.A.currentBpm));
    return () => window.clearInterval(interval);
  }, [running]);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = (now: number) => {
      setClock(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const hit = useCallback((lane: number) => {
    if (!running) return;
    const now = performance.now();
    let closest: Note | undefined;
    for (const note of notes) if (note.lane === lane && (!closest || Math.abs(note.target - now) < Math.abs(closest.target - now))) closest = note;
    if (!closest || Math.abs(closest.target - now) > 260) {
      setCombo(0);
      setCallout('MISS');
      return;
    }
    const distance = Math.abs(closest.target - now);
    const perfect = distance < 120;
    setNotes((current) => current.filter((note) => note.id !== closest?.id));
    setScore((value) => value + (perfect ? 1000 : 500));
    setCombo((value) => value + 1);
    setCallout(perfect ? 'PERFECT' : 'GREAT');
    if (perfect) {
      getMixer().triggerPerfect();
      setPulse(true);
      navigator.vibrate?.(24);
      window.setTimeout(() => setPulse(false), 180);
    }
  }, [notes, running]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const lane = keys.indexOf(event.key.toUpperCase());
      if (lane >= 0) hit(lane);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [hit]);

  return (
    <section className={`rhythm-game ${pulse ? 'perfect-pulse' : ''}`} data-testid="rhythm-game">
      <header><div><span>LIVE CHALLENGE</span><h2>Beat Reactor</h2></div><button type="button" aria-label="放大音游"><Maximize2 /></button></header>
      <div className="game-modes"><button className={mode === 'bpm' ? 'active' : ''} type="button" onClick={() => setMode('bpm')}>BPM MATCH</button><button className={mode === 'drums' ? 'active' : ''} type="button" onClick={() => setMode('drums')}>DRUM GRID</button><button className={mode === 'harmony' ? 'active' : ''} type="button" onClick={() => setMode('harmony')}>HARMONY</button></div>
      <div className="game-stats"><span>SCORE <b>{score.toString().padStart(6, '0')}</b></span><span><Trophy /> COMBO <b>×{combo}</b></span></div>
      <div className="note-highway">
        <div className="highway-grid" />
        {notes.map((note) => {
          const travel = Math.max(0, Math.min(1, 1 - (note.target - clock) / 1500));
          return <i className={`game-note lane-${note.lane}`} key={note.id} style={{ top: `${8 + travel * 70}%` }} />;
        })}
        <strong className={`game-callout ${callout === 'PERFECT' ? 'perfect' : ''}`}>{callout}</strong>
        <div className="judge-line" />
        <div className="game-lanes">{keys.map((key, lane) => <button type="button" key={key} onPointerDown={() => hit(lane)}><span>{key}</span><small>{mode === 'harmony' ? ['C', 'Am', 'F', 'G'][lane] : ['KICK', 'CLAP', 'HAT', 'FX'][lane]}</small></button>)}</div>
      </div>
      <footer><p>{mode === 'bpm' ? '跟随 Deck A 的 BPM，在判定线击中节拍' : mode === 'harmony' ? '用 A · S · D · F 演奏和声' : '击中鼓点，Perfect 会真实加重低频'}</p><button className="game-start" type="button" onClick={() => { setRunning(!running); setCallout(running ? 'PAUSED' : 'DROP IN'); }}>{running ? <Pause /> : <Play />}{running ? '暂停' : '开始挑战'}</button></footer>
    </section>
  );
}
