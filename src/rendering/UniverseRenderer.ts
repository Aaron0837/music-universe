import * as THREE from 'three';
import type { AudioFrame, PresetInstance, Quality } from '../types';
import type { AppState } from '../state/AppState';
import type { PresetRegistry } from '../presets/registry';
import { InteractionController } from '../interaction/InteractionController';

export class UniverseRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, .1, 100);
  readonly interaction: InteractionController;
  readonly quality: Quality;
  private instance?: PresetInstance;
  private frameId = 0;
  private last = performance.now();
  private frameTimes: number[] = [];
  private running = false;
  onFrame?: (delta: number) => AudioFrame;
  onStats?: (frame: AudioFrame, fps: number) => void;

  constructor(canvas: HTMLCanvasElement, private registry: PresetRegistry, private state: AppState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x05020d);
    this.camera.position.z = 18;
    const mobile = matchMedia('(max-width: 720px)').matches;
    this.quality = mobile ? 'low' : devicePixelRatio > 1.5 ? 'medium' : 'high';
    this.interaction = new InteractionController(canvas, this.camera);
    this.resize(); window.addEventListener('resize', this.resize);
  }

  setPreset(id: string): void {
    this.instance?.dispose();
    const preset = this.registry.get(id);
    this.instance = preset.create({ scene: this.scene, camera: this.camera, renderer: this.renderer, quality: this.quality, hue: () => this.state.hue, sensitivity: () => this.state.sensitivity });
    this.state.activePreset = id; this.state.notify(); this.resize();
  }
  start(): void { if (this.running) return; this.running = true; this.last = performance.now(); this.frameId = requestAnimationFrame(this.loop); }
  private loop = (now: number) => {
    if (!this.running) return;
    const delta = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const frame = this.onFrame?.(delta);
    if (frame && this.instance) {
      const input = this.interaction.tick(delta); input.reducedMotion = this.state.reducedMotion;
      this.camera.position.z = 18 / input.zoom;
      this.instance.update(frame, input, delta);
      this.renderer.render(this.scene, this.camera);
      this.frameTimes.push(delta); if (this.frameTimes.length > 60) this.frameTimes.shift();
      const fps = this.frameTimes.length / this.frameTimes.reduce((sum, value) => sum + value, 0);
      this.onStats?.(frame, fps);
    }
    this.frameId = requestAnimationFrame(this.loop);
  };
  reset(): void { this.instance?.reset(); }
  private resize = () => { const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio, this.quality === 'low' ? 1.25 : 1.8); this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.instance?.resize(width, height, ratio); };
  dispose(): void { this.running = false; cancelAnimationFrame(this.frameId); window.removeEventListener('resize', this.resize); this.interaction.dispose(); this.instance?.dispose(); this.renderer.dispose(); }
}
