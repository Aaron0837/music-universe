import * as THREE from 'three';
import type { UniversePreset } from '../../types/visuals';
import { disposeObject } from '../shared';

/**
 * Aurora curtains. One quad, all motion procedural in the fragment shader so the
 * preset stays smooth on the low quality tier.
 */
export const auroraPreset: UniversePreset = {
  id: 'aurora', name: 'AURORA VEIL', description: 'Curtains of light that swell with the midrange.', author: 'Music Universe',
  create({ scene, quality, hue, sensitivity }) {
    const root = new THREE.Group(); scene.add(root);
    const geometry = new THREE.PlaneGeometry(74, 40);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uMid: { value: 0 }, uTreble: { value: 0 }, uEnergy: { value: 0 }, uPointer: { value: 0 },
        uLayers: { value: quality === 'low' ? 2 : 3 },
        uColorA: { value: new THREE.Color('#2ee8b0') }, uColorB: { value: new THREE.Color('#6f8dff') },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uMid; uniform float uTreble; uniform float uEnergy; uniform float uPointer; uniform float uLayers;
        uniform vec3 uColorA; uniform vec3 uColorB;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          vec2 uv = vUv;
          float t = uTime * 0.09;
          float sway = uPointer * 0.08;
          float curtain = 0.0;
          for (int i = 0; i < 3; i++) {
            if (float(i) >= uLayers) break;
            float fi = float(i);
            float wobble = noise(vec2(uv.x * 2.1 + fi * 5.3 + t, t * 0.6 + fi)) * 0.42;
            float centre = 0.46 + wobble + fi * 0.11 - sway * (fi + 1.0);
            float width = 0.085 + uMid * 0.05 + fi * 0.018;
            float band = smoothstep(width, 0.0, abs(uv.y - centre - (uv.x - 0.5) * 0.22));
            curtain += band * (0.55 - fi * 0.14);
          }
          float verticalFade = smoothstep(0.0, 0.3, uv.y) * (1.0 - smoothstep(0.7, 1.0, uv.y));
          float intensity = curtain * verticalFade * (0.4 + uMid * 1.0 + uTreble * 0.35) * (0.75 + uEnergy * 0.9);
          vec3 col = mix(uColorA, uColorB, clamp(uv.y + uTreble * 0.3, 0.0, 1.0));
          gl_FragColor = vec4(col * intensity, intensity * 0.9);
        }
      `,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.z = -9;
    root.add(plane);
    let time = 0;
    return {
      update(frame, input, delta) {
        const power = sensitivity();
        time += delta * (input.reducedMotion ? 0.15 : 1);
        material.uniforms.uTime.value = time;
        material.uniforms.uMid.value = frame.mid * power;
        material.uniforms.uTreble.value = frame.treble * power;
        material.uniforms.uEnergy.value = (frame.beatPulse + input.energy) * power;
        material.uniforms.uPointer.value = input.x;
        material.uniforms.uColorA.value.setHSL(((hue() + 150) % 360) / 360, 0.86, 0.6);
        material.uniforms.uColorB.value.setHSL(((hue() + frame.mid * 70 + 250) % 360) / 360, 0.82, 0.64);
        plane.position.y = input.worldY * 0.06;
        root.scale.setScalar(input.zoom * (1 + frame.bass * 0.07 * power));
      },
      resize() {},
      reset() { time = 0; plane.position.set(0, 0, -9); root.scale.setScalar(1); },
      dispose() { disposeObject(root); },
    };
  },
};
