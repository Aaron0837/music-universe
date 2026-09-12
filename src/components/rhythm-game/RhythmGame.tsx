import { Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMixer, peekMixer } from '../../audio/engine/runtime';
import { useAppStore } from '../../stores/useAppStore';
import { usePreferences } from '../../stores/usePreferences';
import { RhythmSession, type GameMode } from './RhythmSession';

const keys = ['A', 'S', 'D', 'F'];
export function RhythmGame() {
  const [running, setRunning] = useState(false), [mode, setMode] = useState<GameMode>('drums');
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState({ score: 0, combo: 0, callout: 'READY' });
  const canvasRef = useRef<HTMLCanvasElement>(null), panelRef = useRef<HTMLElement>(null);
  const session = useRef(new RhythmSession(mode)), flash = useRef(0);
  const frozenPosition = useRef(0);
  const notify = useAppStore((state) => state.notify);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current!;
    panel.querySelector('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel.addEventListener('keydown', trap);
    return () => { panel.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [expanded]);
  const publish = useCallback(() => setStats({ score: session.current.score, combo: session.current.combo, callout: session.current.lastJudgment }), []);
  const hit = useCallback((lane: number) => {
    const mixer = peekMixer(), deck = mixer?.decks.A;
    if (!running || !deck?.isPlaying || deck.isReverse || !deck.beatGrid) return;
    const preferences = usePreferences.getState();
    const result = session.current.hit(lane, deck.position, deck.playbackRate, preferences.latencyMs);
    if (result === 'PERFECT') {
      mixer!.triggerPerfect(preferences.feedbackVolume, mode === 'harmony');
      flash.current = performance.now();
      if (!preferences.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(18);
    }
    publish();
  }, [running, mode, publish]);

  useEffect(() => {
    session.current = new RhythmSession(mode);
    setStats({ score: 0, combo: 0, callout: 'READY' });
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const draw = (now: number) => {
      const w = canvas.clientWidth, h = canvas.clientHeight, ratio = Math.min(devicePixelRatio, 2);
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
      const deck = peekMixer()?.decks.A, position = running ? (deck?.position ?? 0) : frozenPosition.current, rate = deck?.playbackRate ?? 1;
      if (running) frozenPosition.current = position;
      if (running && deck?.isPlaying && !deck.isReverse && deck.beatGrid) {
        const latency = usePreferences.getState().latencyMs / 1000 * rate;
        if (session.current.update(position - latency, deck.beatGrid, rate, deck.transportRevision, deck.duration)) publish();
      }
      const line = h * 0.84, laneWidth = w / 4;
      ctx.strokeStyle = '#759ab025'; ctx.lineWidth = 1;
      for (let lane = 0; lane <= 4; lane++) { ctx.beginPath(); ctx.moveTo(lane * laneWidth, 0); ctx.lineTo(lane * laneWidth, h); ctx.stroke(); }
      for (let row = 0; row < 9; row++) { const y = row * h / 9; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.fillStyle = '#85edc1'; ctx.fillRect(0, line, w, 2);
      for (const note of session.current.notes) {
        if (note.hit) continue;
        const y = line - (note.time - position) / rate / 2.4 * line;
        if (y < -20 || y > h) continue;
        ctx.fillStyle = ['#87e7bb', '#bed1ff', '#f5d495', '#d8b9f7'][note.lane];
        ctx.shadowBlur = 16; ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(note.lane * laneWidth + 10, y - 5, laneWidth - 20, 10); ctx.shadowBlur = 0;
      }
      const reduced = usePreferences.getState().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced && now - flash.current < 500) {
        const t = (now - flash.current) / 500;
        ctx.strokeStyle = `rgba(135,231,187,${1 - t})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(w / 2, line, t * w, 0, Math.PI * 2); ctx.stroke();
      }
      canvas.dataset.notes = String(session.current.notes.filter((note) => !note.hit).length);
      canvas.dataset.position = position.toFixed(3);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', visibility); raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visibility); };
  }, [running, mode, publish]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (event.key === 'Escape') { setExpanded(false); return; }
      const lane = keys.indexOf(event.key.toUpperCase());
      if (lane >= 0) { event.preventDefault(); hit(lane); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [hit]);

  const start = async () => {
    if (running) { setRunning(false); return; }
    const deck = getMixer().decks.A;
    if (!deck.duration) return notify('请先为 Deck A 载入音乐或播放双 Deck 示例');
    if (deck.isReverse) return notify('音游需要正向播放，请先关闭 Deck A 倒放');
    if (!deck.beatGrid) return notify('请等待拍点分析，或手动校准 BPM 与首拍');
    try { await deck.play(); session.current.rebuild(deck.position, deck.beatGrid, deck.transportRevision); setRunning(true); } catch { notify('声音未能启动，请再次点击开始'); }
  };
  return <section ref={panelRef} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label={expanded ? '放大音游舞台' : undefined} className={`rhythm-game ${expanded ? 'rhythm-game--expanded' : ''}`} data-testid="rhythm-game">
    <header><div><span>PLAY THE MOMENT</span><h2>Beat Garden</h2></div><button type="button" aria-label={expanded ? '退出放大音游' : '放大音游'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 /> : <Maximize2 />}</button></header>
    <div className="game-modes">{(['bpm', 'drums', 'harmony'] as const).map((value) => <button key={value} className={mode === value ? 'active' : ''} type="button" onClick={() => setMode(value)}>{value === 'bpm' ? 'BPM MATCH' : value === 'drums' ? 'DRUM GRID' : 'HARMONY'}</button>)}</div>
    <div className="game-stats"><span>SCORE <b>{String(stats.score).padStart(6, '0')}</b></span><span>COMBO <b>×{stats.combo}</b></span></div>
    <div className="note-highway"><canvas ref={canvasRef} aria-label="跟随 Deck A 音乐时钟的四轨音游" />
      <strong className={`game-callout ${stats.callout === 'PERFECT' ? 'perfect' : ''}`} aria-live="polite">{stats.callout}</strong>
      <div className="game-lanes">{keys.map((key, lane) => <button type="button" aria-label={`击打 ${key}`} key={key} onPointerDown={(event) => { event.preventDefault(); hit(lane); }} onClick={(event) => { if (event.detail === 0) hit(lane); }}><span>{key}</span><small>{mode === 'harmony' ? ['C', 'Dm', 'G', 'Am'][lane] : ['KICK', 'CLAP', 'HAT', 'FX'][lane]}</small></button>)}</div>
    </div>
    <footer><p>{mode === 'bpm' ? '只击 A 轨整拍，练习稳定跟拍' : mode === 'harmony' ? '每两拍同时击中双轨，完成和声组合' : '八步鼓机节奏 · Perfect 加重底鼓'}<br />Perfect ±80 ms · Great ±150 ms · Deck A 暂停时冻结</p><button className="game-start" type="button" onClick={() => void start()}>{running ? <Pause /> : <Play />}{running ? '暂停挑战' : '开始挑战'}</button></footer>
  </section>;
}
