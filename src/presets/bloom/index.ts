import * as THREE from 'three';
import type { UniversePreset } from '../../types/visuals';
import { disposeObject } from '../shared';

export const bloomPreset: UniversePreset = {
  id: 'bloom', name: 'CYBER BLOOM', description: 'Plant light with a touch. Music decides how it grows.', author: 'Music Universe',
  create({ scene, hue, sensitivity }) {
    const root = new THREE.Group(); scene.add(root); const blooms: THREE.Group[] = []; let lastBurst = 0;
    const plant = (x = 0, y = 0) => { const flower = new THREE.Group(); flower.position.set(x, y, 0); for (let i = 0; i < 12; i++) { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(Math.cos(i / 12 * Math.PI * 2) * 1.3, Math.sin(i / 12 * Math.PI * 2) * 1.3, 0), new THREE.Vector3(Math.cos(i / 12 * Math.PI * 2) * 3.5, Math.sin(i / 12 * Math.PI * 2) * 3.5, Math.sin(i) * .8)]); const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .028, 5, false), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(((hue() + i * 8) % 360) / 360, .9, .62), transparent: true, opacity: .8, blending: THREE.AdditiveBlending })); flower.add(tube); } flower.scale.setScalar(.01); root.add(flower); blooms.push(flower); if (blooms.length > 8) disposeObject(blooms.shift()!); };
    const reset = () => { while (blooms.length) disposeObject(blooms.pop()!); plant(); };
    reset(); return { update(frame, input, delta) { if (input.burst > .85 && lastBurst <= .85) plant(input.worldX, input.worldY); lastBurst = input.burst; const power = sensitivity(); blooms.forEach((flower, index) => { const ageScale = Math.min(1, flower.scale.x + delta * .45); const pulse = 1 + frame.mid * .35 * power + frame.beatPulse * .18; flower.scale.setScalar(ageScale * pulse * input.zoom); flower.rotation.z += delta * (.03 + frame.treble * .16) * (index % 2 ? 1 : -1); flower.children.forEach((child, i) => { const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial; material.color.setHSL(((hue() + i * 8 + frame.bass * 70) % 360) / 360, .92, .6); material.opacity = .35 + frame.rms * .65; }); }); }, resize() {}, reset, dispose() { disposeObject(root); } };
  }
};
