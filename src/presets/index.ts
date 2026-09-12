import { PresetRegistry } from './registry';
import { nebulaPreset } from './nebula';
import { gravityPreset } from './gravity';
import { bloomPreset } from './bloom';
import { tunnelPreset } from './tunnel';
import { auroraPreset } from './aurora';

/** Single source of truth: register a new preset here and it appears everywhere. */
export const universePresets = [nebulaPreset, gravityPreset, bloomPreset, tunnelPreset, auroraPreset];

export function createPresetRegistry(): PresetRegistry {
  const registry = new PresetRegistry();
  for (const preset of universePresets) registry.register(preset);
  return registry;
}
