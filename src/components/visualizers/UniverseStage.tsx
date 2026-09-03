import { useEffect, useRef } from 'react';
import { getMixer } from '../../audio/engine/runtime';
import { nebulaPreset } from '../../presets/nebula';
import { gravityPreset } from '../../presets/gravity';
import { bloomPreset } from '../../presets/bloom';
import { PresetRegistry } from '../../presets/registry';
import { UniverseRenderer } from '../../rendering/UniverseRenderer';
import { AppState } from '../../state/AppState';

export function UniverseStage({ preset }: { preset: 'nebula' | 'gravity' | 'bloom' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const registry = new PresetRegistry();
    registry.register(nebulaPreset);
    registry.register(gravityPreset);
    registry.register(bloomPreset);
    const state = new AppState();
    const renderer = new UniverseRenderer(canvas, registry, state);
    renderer.onFrame = () => {
      const frame = getMixer().frame();
      return { ...frame, transient: frame.beatPulse };
    };
    renderer.setPreset(preset);
    renderer.start();
    return () => renderer.dispose();
  }, [preset]);
  return <canvas className="visual-canvas" ref={ref} />;
}
