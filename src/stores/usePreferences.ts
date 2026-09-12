import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Preferences {
  pointerEffects: boolean;
  reducedMotion: boolean;
  latencyMs: number;
  feedbackVolume: number;
  setPreference<K extends keyof Omit<Preferences, 'setPreference'>>(key: K, value: Preferences[K]): void;
}

export const usePreferences = create<Preferences>()(persist((set) => ({
  pointerEffects: true,
  reducedMotion: false,
  latencyMs: 0,
  feedbackVolume: 0.5,
  setPreference: (key, value) => set({ [key]: value }),
}), { name: 'mu-preferences-v2' }));
