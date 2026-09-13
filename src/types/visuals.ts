import type * as THREE from 'three';

export interface AudioFrame {
  timeDomain: Uint8Array<ArrayBuffer>;
  frequencyBins: Uint8Array<ArrayBuffer>;
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  transient: number;
  beatPulse: number;
}

export interface InteractionFrame {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  pressed: boolean;
  energy: number;
  burst: number;
  zoom: number;
  reducedMotion: boolean;
}

export interface PresetContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  quality: Quality;
  hue: () => number;
  sensitivity: () => number;
}

export interface PresetInstance {
  update(frame: AudioFrame, input: InteractionFrame, delta: number): void;
  resize(width: number, height: number, pixelRatio: number): void;
  reset(): void;
  dispose(): void;
}

export interface UniversePreset {
  id: string;
  name: string;
  description: string;
  author: string;
  create(context: PresetContext): PresetInstance;
}

export type Quality = 'low' | 'medium' | 'high';
