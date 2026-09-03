import { useEffect, useRef } from 'react';
import { getMixer } from '../../audio/engine/runtime';

export type CanvasVisualMode = 'plasma' | 'peak' | 'orb' | 'waves';

export function CanvasVisualizer({ mode }: { mode: CanvasVisualMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let request = 0;
    const render = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio, 1.7);
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#070914';
      context.fillRect(0, 0, width, height);
      const frame = getMixer().frame();
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#7267ff');
      gradient.addColorStop(0.5, '#2dd4bf');
      gradient.addColorStop(1, '#ff5db1');
      context.strokeStyle = gradient;
      context.fillStyle = gradient;
      context.lineWidth = 2;
      if (mode === 'peak') {
        const bars = 72;
        for (let i = 0; i < bars; i++) {
          const energy = frame.frequencyBins[Math.floor(i / bars * frame.frequencyBins.length * 0.7)] / 255;
          const h = 8 + energy * height * 0.72;
          context.globalAlpha = 0.45 + energy * 0.55;
          context.fillRect(i * width / bars + 1, height / 2 - h / 2, Math.max(2, width / bars - 4), h);
        }
      } else if (mode === 'waves') {
        for (let layer = 0; layer < 5; layer++) {
          context.beginPath();
          context.globalAlpha = 0.2 + layer * 0.13;
          for (let x = 0; x <= width; x += 5) {
            const index = Math.floor(x / width * frame.timeDomain.length);
            const y = height / 2 + (frame.timeDomain[index] - 128) / 128 * (45 + layer * 22) + Math.sin(x * 0.012 + time * 0.001 + layer) * 18;
            if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
          }
          context.stroke();
        }
      } else if (mode === 'orb') {
        context.translate(width / 2, height / 2);
        const points = 160;
        context.beginPath();
        for (let i = 0; i <= points; i++) {
          const angle = i / points * Math.PI * 2;
          const energy = frame.frequencyBins[i % frame.frequencyBins.length] / 255;
          const radius = Math.min(width, height) * (0.19 + energy * 0.17);
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (!i) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath();
        context.shadowColor = '#7267ff';
        context.shadowBlur = 42 + frame.bass * 80;
        context.fill();
      } else {
        context.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 24; i++) {
          const energy = frame.frequencyBins[i * 4] / 255;
          context.globalAlpha = 0.08 + energy * 0.16;
          context.beginPath();
          context.arc(width / 2 + Math.sin(time * 0.0003 + i) * width * 0.27, height / 2 + Math.cos(time * 0.0002 + i * 1.7) * height * 0.24, 24 + energy * 110, 0, Math.PI * 2);
          context.fill();
        }
        context.globalCompositeOperation = 'source-over';
      }
      context.globalAlpha = 1;
      request = requestAnimationFrame(render);
    };
    request = requestAnimationFrame(render);
    return () => cancelAnimationFrame(request);
  }, [mode]);
  return <canvas className="visual-canvas" ref={ref} />;
}
