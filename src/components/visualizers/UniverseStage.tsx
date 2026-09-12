import { useEffect, useRef, useState } from 'react';
import { peekMixer } from '../../audio/engine/runtime';
import { createPresetRegistry } from '../../presets';
import { UniverseRenderer } from '../../rendering/UniverseRenderer';
import { AppState } from '../../state/AppState';
import { usePreferences } from '../../stores/usePreferences';
import { CanvasVisualizer } from './CanvasVisualizer';
import type { AudioFrame } from '../../types';

export type UniversePresetId = 'nebula' | 'gravity' | 'bloom' | 'tunnel' | 'aurora';

export function UniverseStage({ preset }: { preset: UniversePresetId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const reduced = usePreferences((state) => state.reducedMotion);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || fallback) return;
    const registry = createPresetRegistry();
    const state = new AppState();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { state.reducedMotion = reduced || media.matches; };
    apply(); media.addEventListener('change', apply);
    let renderer: UniverseRenderer | undefined;
    try {
      renderer = new UniverseRenderer(canvas, registry, state);
      const frame: AudioFrame = { frequencyBins: new Uint8Array(512), timeDomain: new Uint8Array(1024).fill(128), bass: 0, mid: 0, treble: 0, rms: 0, beatPulse: 0, transient: 0 };
      renderer.onFrame = () => {
        const live = peekMixer()?.frame();
        if (live) Object.assign(frame, live, { transient: live.beatPulse });
        return frame;
      };
      renderer.setPreset(preset); renderer.start();
    } catch { renderer?.dispose(); setFallback(true); }
    return () => { media.removeEventListener('change', apply); renderer?.dispose(); };
  }, [preset, reduced, fallback]);
  return fallback ? <CanvasVisualizer mode="peak" /> : <canvas className="visual-canvas" aria-label="交互式三维音乐宇宙" ref={ref} />;
}
