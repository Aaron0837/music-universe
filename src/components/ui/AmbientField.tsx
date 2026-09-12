import { useEffect, useRef } from 'react';
import { usePreferences } from '../../stores/usePreferences';

/** One animation loop owns both the CSS light position and the particle canvas. */
export function AmbientField({ intensity = 1, disabled = false }: { intensity?: number; disabled?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const enabled = usePreferences((state) => state.pointerEffects);
  const reduced = usePreferences((state) => state.reducedMotion);

  useEffect(() => {
    const element = root.current;
    const surface = canvas.current;
    const ctx = surface?.getContext('2d');
    if (!element || !surface || !ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = matchMedia('(hover: hover) and (pointer: fine)');
    let width = innerWidth, height = innerHeight, frame = 0;
    let x = width * 0.68, y = height * 0.35, tx = x, ty = y;
    let active = false, lastInput = 0, previous = 0, slowFrames = 0;
    let budget = 64;
    const particles = Array.from({ length: 64 }, (_, i) => ({
      u: ((i * 0.61803398875) % 1), v: ((Math.sin(i * 78.233 + 1) * 43758.5453) % 1 + 1) % 1, x: 0, y: 0,
    }));
    const allowed = () => enabled && !disabled && !reduced && !motion.matches && pointer.matches;
    const draw = (now: number) => {
      frame = 0;
      if (!allowed() || document.hidden) return;
      const delta = Math.min(0.05, (now - previous) / 1000 || 0.016);
      if (previous && now - previous > 27) slowFrames++;
      if (slowFrames > 25) budget = 32;
      previous = now;
      const lerp = 1 - Math.exp(-delta * 7);
      x += (tx - x) * lerp; y += (ty - y) * lerp;
      element.style.setProperty('--pointer-x', `${x}px`);
      element.style.setProperty('--pointer-y', `${y}px`);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < budget; i++) {
        const p = particles[i];
        const homeX = p.u * width, homeY = p.v * height;
        const dx = homeX - x, dy = homeY - y;
        const distance = Math.hypot(dx, dy);
        const force = active ? Math.max(0, 1 - distance / 220) * 32 : 0;
        p.x += (homeX + dx / Math.max(1, distance) * force - p.x) * lerp;
        p.y += (homeY + dy / Math.max(1, distance) * force - p.y) * lerp;
        ctx.fillStyle = `rgba(65, 118, 100, ${intensity * (distance < 220 ? 0.55 : 0.22)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, i % 5 === 0 ? 2 : 1.1, 0, Math.PI * 2); ctx.fill();
      }
      if (active || now - lastInput < 1800) frame = requestAnimationFrame(draw);
    };
    const wake = () => { if (!frame && allowed() && !document.hidden) frame = requestAnimationFrame(draw); };
    const resize = () => {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      surface.width = Math.round(width * ratio); surface.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles.forEach((p) => { p.x = p.u * width; p.y = p.v * height; });
      lastInput = performance.now(); wake();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      tx = event.clientX; ty = event.clientY; active = true; lastInput = performance.now(); wake();
    };
    const leave = () => { active = false; lastInput = performance.now(); wake(); };
    const visibility = () => { cancelAnimationFrame(frame); frame = 0; previous = 0; if (!document.hidden) wake(); };
    const preference = () => {
      cancelAnimationFrame(frame); frame = 0;
      ctx.clearRect(0, 0, width, height);
      element.dataset.animated = String(allowed());
      if (!allowed()) { element.style.removeProperty('--pointer-x'); element.style.removeProperty('--pointer-y'); }
      wake();
    };
    element.dataset.animated = String(allowed());
    if (!allowed()) { element.style.removeProperty('--pointer-x'); element.style.removeProperty('--pointer-y'); }
    resize();
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', preference); pointer.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', preference); pointer.removeEventListener('change', preference);
      ctx.clearRect(0, 0, width, height);
    };
  }, [enabled, disabled, reduced, intensity]);

  return <div className="ambient-field" ref={root} aria-hidden="true" hidden={disabled || !enabled} style={{ opacity: intensity }}>
    <div className="ambient-light" /><canvas ref={canvas} />
  </div>;
}
