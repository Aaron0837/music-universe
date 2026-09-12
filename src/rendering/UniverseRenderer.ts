import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createGradePass } from './GradePass';
import type { AudioFrame, PresetInstance, Quality } from '../types';
import type { AppState } from '../state/AppState';
import type { PresetRegistry } from '../presets/registry';
import { InteractionController } from '../interaction/InteractionController';

/** Bloom params per quality tier. Low skips the pipeline entirely for weak devices. */
const BLOOM: Record<Quality, { strength: number; radius: number; threshold: number }> = {
  high: { strength: 0.95, radius: 0.72, threshold: 0.42 },
  medium: { strength: 0.78, radius: 0.62, threshold: 0.5 },
  low: { strength: 0, radius: 0, threshold: 1 },
};

export class UniverseRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, .1, 100);
  readonly interaction: InteractionController;
  quality: Quality;
  private instance?: PresetInstance;
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloomPass?: UnrealBloomPass;
  private gradePass?: ShaderPass;
  private frameId = 0;
  private last = performance.now();
  private frameCount = 0;
  private frameTotal = 0;
  private resizeObserver: ResizeObserver;
  private running = false;
  private energy = 0;
  onFrame?: (delta: number) => AudioFrame;
  onStats?: (frame: AudioFrame, fps: number) => void;

  constructor(canvas: HTMLCanvasElement, private registry: PresetRegistry, private state: AppState) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // HDR headroom: additive light sources can exceed 1.0 and bloom instead of clipping.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color(0x05020d);
    this.camera.position.z = 18;
    const mobile = matchMedia('(max-width: 720px)').matches;
    this.quality = mobile ? 'low' : devicePixelRatio > 1.5 ? 'medium' : 'high';
    this.interaction = new InteractionController(canvas, this.camera);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.resize(); window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
  }

  /** Builds the composer for the current quality tier. Rebuilt when quality changes. */
  private buildPipeline(): void {
    this.composer?.dispose();
    this.composer = undefined; this.renderPass = undefined; this.bloomPass = undefined; this.gradePass = undefined;
    if (this.quality === 'low') return;
    const composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);
    const settings = BLOOM[this.quality];
    // Half-resolution bloom: visually identical, roughly a quarter of the fill cost.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), settings.strength, settings.radius, settings.threshold);
    composer.addPass(this.bloomPass);
    this.gradePass = createGradePass();
    composer.addPass(this.gradePass);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
    this.composer = composer;
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
      this.energy += ((frame.rms * .7 + frame.beatPulse * .3) - this.energy) * Math.min(1, delta * 6);
      if (this.bloomPass) this.bloomPass.strength = BLOOM[this.quality].strength * (1 + this.energy * .55);
      if (this.gradePass) {
        this.gradePass.uniforms.uEnergy.value = this.energy;
        this.gradePass.uniforms.uTime.value = now * 0.001;
      }
      if (this.composer) this.composer.render(delta); else this.renderer.render(this.scene, this.camera);
      this.frameCount++; this.frameTotal += delta;
      if (this.frameCount >= 180) {
        const fps = this.frameCount / this.frameTotal;
        this.onStats?.(frame, fps);
        if (fps < 35 && this.quality !== 'low') {
          this.quality = this.quality === 'high' ? 'medium' : 'low';
          this.buildPipeline();
          this.setPreset(this.state.activePreset);
        }
        this.frameCount = 0; this.frameTotal = 0;
      }
    }
    this.frameId = requestAnimationFrame(this.loop);
  };
  reset(): void { this.instance?.reset(); }
  private visibility = () => {
    cancelAnimationFrame(this.frameId);
    if (!document.hidden && this.running) { this.last = performance.now(); this.frameId = requestAnimationFrame(this.loop); }
  };
  private resize = () => {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio, this.quality === 'low' ? 1.25 : 1.8);
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(ratio); this.composer?.setSize(width, height);
    this.bloomPass?.setSize(width, height);
    this.instance?.resize(width, height, ratio);
  };
  dispose(): void {
    this.running = false; cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('resize', this.resize);
    this.interaction.dispose();
    this.instance?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
