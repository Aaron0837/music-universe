import { useEffect, useRef } from 'react';
import { getMixer } from '../../audio/engine/runtime';

export function Waveform({ progress = 0, compact = false }: { progress?: number; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frameId = 0;
    const draw = () => {
      const ratio = Math.min(devicePixelRatio, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const frame = getMixer().frame();
      canvas.dataset.rms = frame.rms.toFixed(3);
      const bars = compact ? 56 : 96;
      for (let i = 0; i < bars; i++) {
        const bin = frame.frequencyBins[Math.floor(i / bars * frame.frequencyBins.length * 0.6)] / 255;
        const barHeight = Math.max(2, bin * height * 0.82);
        context.fillStyle = i / bars <= progress ? 'var(--accent)' : 'var(--wave-muted)';
        context.fillRect(i * width / bars, (height - barHeight) / 2, Math.max(1, width / bars - 2), barHeight);
      }
      frameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameId);
  }, [compact, progress]);
  return <canvas className={`waveform-canvas ${compact ? 'waveform-canvas--compact' : ''}`} ref={canvasRef} aria-label="实时音频波形" />;
}
