import { describe, expect, it } from 'vitest';
import { PresetRegistry } from './registry';
import type { UniversePreset } from '../types';

const preset = (id: string): UniversePreset => ({ id, name: id, description: '', author: '', create: () => ({ update() {}, resize() {}, reset() {}, dispose() {} }) });
describe('PresetRegistry', () => {
  it('registers and resolves a preset', () => { const registry = new PresetRegistry(); registry.register(preset('a')); expect(registry.get('a').id).toBe('a'); });
  it('rejects duplicate identifiers', () => { const registry = new PresetRegistry(); registry.register(preset('a')); expect(() => registry.register(preset('a'))).toThrow('Duplicate'); });
  it('rejects unknown identifiers', () => { expect(() => new PresetRegistry().get('missing')).toThrow('Unknown'); });
});
