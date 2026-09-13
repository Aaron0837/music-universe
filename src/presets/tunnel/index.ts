import * as THREE from 'three';
import type { UniversePreset } from '../../types/visuals';
import { disposeObject, seeded } from '../shared';

/**
 * Hyperspace tunnel. Star positions live entirely in the vertex shader, so a frame
 * costs one uniform update instead of rewriting the position buffer.
 */
export const tunnelPreset: UniversePreset = {
  id: 'tunnel', name: 'HYPER TUNNEL', description: 'Bass opens the throat. Treble streaks the walls.', author: 'Music Universe',
  create({ scene, quality, hue, sensitivity }) {
    const root = new THREE.Group(); scene.add(root);
    const count = quality === 'high' ? 5000 : quality === 'medium' ? 3200 : 1600;
    const angles = new Float32Array(count), radii = new Float32Array(count), depths = new Float32Array(count), sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      angles[i] = seeded(i, 2) * Math.PI * 2;
      radii[i] = 0.65 + seeded(i, 3) * 3.4;
      depths[i] = seeded(i);
      sizes[i] = 0.6 + seeded(i, 4) * 2.6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uProgress: { value: 0 }, uRadius: { value: 3.6 }, uEnergy: { value: 0 },
        uSwirl: { value: 1.1 }, uLength: { value: 34 }, uColorA: { value: new THREE.Color('#3ad6ff') }, uColorB: { value: new THREE.Color('#c46bff') },
      },
      vertexShader: /* glsl */`
        attribute float aAngle; attribute float aRadius; attribute float aDepth; attribute float aSize;
        uniform float uProgress; uniform float uRadius; uniform float uEnergy; uniform float uSwirl; uniform float uLength;
        varying float vFade; varying float vSeed;
        void main() {
          float z = fract(aDepth + uProgress);
          float a = aAngle + uProgress * uSwirl * 6.2831853 + z * uSwirl;
          float r = aRadius * uRadius * (1.0 + uEnergy * 0.3);
          vec3 p = vec3(cos(a) * r, sin(a) * r, -z * uLength);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * (150.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
          vFade = smoothstep(0.0, 0.1, z) * (1.0 - smoothstep(0.68, 1.0, z));
          vSeed = aDepth;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColorA; uniform vec3 uColorB;
        varying float vFade; varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float alpha = 1.0 - d * 2.0;
          gl_FragColor = vec4(mix(uColorA, uColorB, vSeed), alpha * alpha * vFade);
        }
      `,
    });
    const points = new THREE.Points(geometry, material);
    // Star positions are generated in the vertex shader, so the CPU-side bounds are
    // meaningless here; disabling culling keeps the tunnel visible at every angle.
    points.frustumCulled = false;
    root.add(points);
    let progress = 0;
    return {
      update(frame, input, delta) {
        const power = sensitivity();
        progress = (progress + delta * (input.reducedMotion ? 0.05 : 0.16) * (0.6 + frame.rms * 1.6)) % 1;
        material.uniforms.uProgress.value = progress;
        material.uniforms.uRadius.value = 3.6 * input.zoom * (1 + frame.bass * 0.22 * power);
        material.uniforms.uEnergy.value = frame.beatPulse * power;
        material.uniforms.uColorA.value.setHSL(((hue() + 180) % 360) / 360, 0.9, 0.62);
        material.uniforms.uColorB.value.setHSL(((hue() + frame.mid * 90 + 280) % 360) / 360, 0.85, 0.66);
        root.rotation.z += delta * 0.06 * (input.reducedMotion ? 0.2 : 1);
      },
      resize() {},
      reset() { progress = 0; root.rotation.set(0, 0, 0); material.uniforms.uProgress.value = 0; },
      dispose() { disposeObject(root); },
    };
  },
};
