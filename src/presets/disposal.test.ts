import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { nebulaPreset } from './nebula';
import { gravityPreset } from './gravity';
import { bloomPreset } from './bloom';
import { tunnelPreset } from './tunnel';
import { auroraPreset } from './aurora';
describe('preset resources', () => {
  it.each([nebulaPreset, gravityPreset, bloomPreset, tunnelPreset, auroraPreset])('releases $name resources on repeated switches', (preset) => {
    const scene = new THREE.Scene();
    for (let iteration = 0; iteration < 5; iteration++) {
      const instance = preset.create({ scene, camera: new THREE.PerspectiveCamera(), renderer: {} as THREE.WebGLRenderer, quality: 'low', hue: () => 150, sensitivity: () => 1 });
      const disposers: ReturnType<typeof vi.spyOn>[] = [];
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) disposers.push(vi.spyOn(mesh.geometry, 'dispose'));
        for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) disposers.push(vi.spyOn(material, 'dispose'));
      });
      expect(disposers.length).toBeGreaterThan(0);
      instance.dispose();
      expect(scene.children).toHaveLength(0);
      for (const dispose of disposers) expect(dispose).toHaveBeenCalled();
    }
  });
});
