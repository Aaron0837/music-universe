import { useEffect, useRef } from 'react';
import { peekMixer } from '../../audio/engine/runtime';
import type { DeckId } from '../../types/models';

export function Waveform({ progress = 0, compact = false, deckId }: { progress?: number; compact?: boolean; deckId?: DeckId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const bins = new Uint8Array(512);
    const draw = () => {
      const ratio = Math.min(devicePixelRatio, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
      const mixer = peekMixer(), deck = deckId ? mixer?.decks[deckId] : undefined;
      if (deck) deck.analyser.getByteFrequencyData(bins);
      const frame = mixer?.frame();
      canvas.dataset.rms = (frame?.rms ?? 0).toFixed(3);
      const bars = compact ? 56 : 144;
      for (let i = 0; i < bars; i++) {
        const peak = deck ? deck.peaks[Math.floor(i / bars * deck.peaks.length)] : (frame?.frequencyBins[Math.floor(i / bars * 240)] ?? 0) / 255;
        const height = Math.max(2, peak * h * 0.85);
        ctx.fillStyle = i / bars <= progressRef.current ? (deckId === 'B' ? '#b0c6ff' : '#65b594') : (deck ? '#425468' : '#9eb5a8');
        ctx.fillRect(i * w / bars, (h - height) / 2, Math.max(1, w / bars - 1), height);
      }
      if (deck?.beatGrid && deck.duration) {
        const grid = deck.beatGrid, beat = 60 / grid.bpm;
        ctx.fillStyle = '#d7e7fa55';
        const step = Math.max(1, Math.ceil(deck.duration / beat / 100));
        for (let time = grid.firstBeat; time < deck.duration; time += beat * step) ctx.fillRect(time / deck.duration * w, 0, 1, h);
        if (deck.loopRange) {
          ctx.fillStyle = '#70edb72a';
          ctx.fillRect(deck.loopRange.start / deck.duration * w, 0, (deck.loopRange.end - deck.loopRange.start) / deck.duration * w, h);
        }
      }
      ctx.fillStyle = '#5fae88'; ctx.fillRect(progressRef.current * w, 0, 2, h);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    const visible = () => { cancelAnimationFrame(raf); if (!document.hidden) draw(); };
    document.addEventListener('visibilitychange', visible); draw();
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visible); };
  }, [compact, deckId]);
  return <canvas className={`waveform-canvas ${compact ? 'waveform-canvas--compact' : ''}`} ref={canvasRef} aria-label={deckId ? `Deck ${deckId} 波形与拍线` : '实时音频波形'} />;
}
