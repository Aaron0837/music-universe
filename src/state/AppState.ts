export type StateListener = () => void;

export class AppState {
  sensitivity = 1;
  hue = 282;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  uiHidden = false;
  activePreset = 'nebula';
  language: 'en' | 'zh' = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  private listeners = new Set<StateListener>();
  subscribe(listener: StateListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify(): void { this.listeners.forEach((listener) => listener()); }
}
