import * as THREE from 'three';
import type { UniversePreset } from '../../types';
import { disposeObject, seeded } from '../shared';

export const nebulaPreset: UniversePreset = {
  id: 'nebula', name: 'NEBULA', description: 'Dust listens to treble. Clouds breathe with the midrange.', author: 'Music Universe',
  create({ scene, quality, hue, sensitivity }) {
    const root = new THREE.Group(); scene.add(root);
    const count = quality === 'high' ? 5200 : quality === 'medium' ? 3400 : 1800;
    const positions = new Float32Array(count * 3); const origins = new Float32Array(count * 3); const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const radius = 2 + seeded(i) * 14; const angle = seeded(i, 2) * Math.PI * 8; const height = (seeded(i, 3) - 0.5) * (2 + radius * 0.35);
      const p = i * 3; positions[p] = origins[p] = Math.cos(angle) * radius; positions[p + 1] = origins[p + 1] = height; positions[p + 2] = origins[p + 2] = Math.sin(angle) * radius; sizes[i] = 1 + seeded(i, 4) * 3;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { color: { value: new THREE.Color() }, energy: { value: 0 } }, vertexShader: `attribute float aSize;varying float vA;uniform float energy;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=(aSize+energy*3.)*(72./-mv.z);gl_Position=projectionMatrix*mv;vA=clamp(1.1-length(position)/20.,.08,.62);}`, fragmentShader: `varying float vA;uniform vec3 color;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(color,(1.-d*2.)*vA);}` });
    const points = new THREE.Points(geometry, material); root.add(points); let time = 0;
    const reset = () => { root.rotation.set(0, 0, 0); };
    return { update(frame, input, delta) { time += delta * (input.reducedMotion ? 0.15 : 1); const power = sensitivity(); material.uniforms.energy.value = frame.treble * power; material.uniforms.color.value.setHSL(((hue() + frame.mid * 70) % 360) / 360, 0.88, 0.64); root.rotation.y += delta * (0.025 + frame.mid * 0.08); root.rotation.z = Math.sin(time * 0.08) * 0.1; points.scale.setScalar(input.zoom * (1 + frame.bass * 0.16 * power)); points.position.x += (input.worldX * 0.05 - points.position.x) * delta; points.position.y += (input.worldY * 0.05 - points.position.y) * delta; const array = geometry.attributes.position.array as Float32Array; const pull = (input.energy + frame.beatPulse) * power; for (let i = 0; i < count; i += 3) { const p = i * 3; array[p + 1] = origins[p + 1] + Math.sin(time * 0.5 + origins[p] * 0.3) * pull; } geometry.attributes.position.needsUpdate = true; }, resize() {}, reset, dispose() { disposeObject(root); } };
  }
};
