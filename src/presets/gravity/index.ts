import * as THREE from 'three';
import type { UniversePreset } from '../../types/visuals';
import { disposeObject, seeded } from '../shared';

export const gravityPreset: UniversePreset = {
  id: 'gravity', name: 'GRAVITY WELL', description: 'Your pointer bends the field. Bass becomes mass.', author: 'Music Universe',
  create({ scene, quality, hue, sensitivity }) {
    const root = new THREE.Group(); scene.add(root); const count = quality === 'high' ? 6000 : quality === 'medium' ? 3800 : 1800;
    const positions = new Float32Array(count * 3); const velocities = new Float32Array(count * 3);
    const reset = () => { for (let i = 0; i < count; i++) { const p = i * 3, r = 2 + seeded(i) * 14, a = seeded(i, 2) * Math.PI * 2; positions[p] = Math.cos(a) * r; positions[p + 1] = Math.sin(a) * r; positions[p + 2] = (seeded(i, 3) - .5) * 3; velocities[p] = -Math.sin(a) * .06; velocities[p + 1] = Math.cos(a) * .06; velocities[p + 2] = 0; } };
    reset(); const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0x5cecff, size: quality === 'low' ? .055 : .035, transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false });
    root.add(new THREE.Points(geometry, material));
    const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .73, 96), new THREE.MeshBasicMaterial({ color: 0xbd5cff, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); root.add(ring);
    return { update(frame, input, delta) { const power = sensitivity(); const targetX = input.worldX, targetY = input.worldY; const step = Math.min(.032, delta) * (input.reducedMotion ? .25 : 1); for (let i = 0; i < count; i++) { const p = i * 3, dx = targetX - positions[p], dy = targetY - positions[p + 1], d2 = dx * dx + dy * dy + .5; const force = (.3 + frame.bass * 2.2 + input.energy * 2) * power / d2; velocities[p] += dx * force * step; velocities[p + 1] += dy * force * step; const damp = .997 - frame.treble * .003; velocities[p] *= damp; velocities[p + 1] *= damp; positions[p] += velocities[p] * step * 16; positions[p + 1] += velocities[p + 1] * step * 16; if (Math.abs(positions[p]) > 22 || Math.abs(positions[p + 1]) > 14 || d2 < .12) { const a = seeded(i + performance.now() * .001) * Math.PI * 2; positions[p] = targetX + Math.cos(a) * 13; positions[p + 1] = targetY + Math.sin(a) * 9; velocities[p] = -Math.sin(a) * .06; velocities[p + 1] = Math.cos(a) * .06; } } geometry.attributes.position.needsUpdate = true; material.color.setHSL(((hue() + frame.mid * 90) % 360) / 360, .9, .65); ring.position.set(targetX, targetY, 0); ring.scale.setScalar(input.zoom * (1 + frame.beatPulse * 2.5)); (ring.material as THREE.MeshBasicMaterial).opacity = .18 + frame.rms * .65; }, resize() {}, reset, dispose() { disposeObject(root); } };
  }
};
