import type { AudioFrame } from '../types/visuals';

export class FallbackRenderer {
  private context: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) { this.context = canvas.getContext('2d')!; this.resize(); addEventListener('resize', this.resize); }
  resize = (): void => { this.canvas.width = innerWidth * Math.min(devicePixelRatio, 1.5); this.canvas.height = innerHeight * Math.min(devicePixelRatio, 1.5); };
  render(frame: AudioFrame, hue: number): void { const { width, height } = this.canvas; const ctx = this.context; ctx.fillStyle = 'rgba(5,2,13,.22)'; ctx.fillRect(0, 0, width, height); const bins = frame.frequencyBins; const bars = 96; const gap = width / bars; for (let i = 0; i < bars; i++) { const value = bins[Math.floor(i / bars * bins.length)] / 255; const h = value * height * .55; ctx.fillStyle = `hsla(${(hue + i * 1.4) % 360},90%,65%,${.25 + value})`; ctx.fillRect(i * gap, height / 2 - h / 2, Math.max(1, gap - 2), h); } }
}
