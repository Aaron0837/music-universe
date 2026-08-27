import type { UniversePreset } from '../types';

export class PresetRegistry {
  private presets = new Map<string, UniversePreset>();
  register(preset: UniversePreset): void { if (this.presets.has(preset.id)) throw new Error(`Duplicate preset: ${preset.id}`); this.presets.set(preset.id, preset); }
  get(id: string): UniversePreset { const preset = this.presets.get(id); if (!preset) throw new Error(`Unknown preset: ${id}`); return preset; }
  list(): UniversePreset[] { return [...this.presets.values()]; }
}
