import { create } from 'zustand';
import type { AppView, DeckId, DeckSnapshot, ThemeMode, Track } from '../types/models';

const emptyDeck: DeckSnapshot = {
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.86,
  bpm: 120,
  sourceBpm: 120,
  keyShift: 0,
  low: 0,
  mid: 0,
  high: 0,
  filter: 1,
  loopBeats: 4,
  loopEnabled: false,
  reverse: false,
};

interface AppStore {
  view: AppView;
  theme: ThemeMode;
  sidebarOpen: boolean;
  tracks: Track[];
  search: string;
  crossfader: number;
  masterVolume: number;
  activeTrackId?: string;
  decks: Record<DeckId, DeckSnapshot>;
  toast?: string;
  setView(view: AppView): void;
  setTheme(theme: ThemeMode): void;
  setSidebar(open: boolean): void;
  setTracks(tracks: Track[]): void;
  setSearch(search: string): void;
  setCrossfader(value: number): void;
  setMasterVolume(value: number): void;
  setActiveTrack(id?: string): void;
  updateDeck(id: DeckId, snapshot: DeckSnapshot): void;
  notify(message?: string): void;
}

const savedTheme = (localStorage.getItem('mu-theme') as ThemeMode | null) ?? 'light';

export const useAppStore = create<AppStore>((set) => ({
  view: 'discover',
  theme: savedTheme,
  sidebarOpen: window.innerWidth >= 840,
  tracks: [],
  search: '',
  crossfader: 0,
  masterVolume: 0.8,
  decks: { A: { ...emptyDeck }, B: { ...emptyDeck } },
  setView: (view) => set({ view }),
  setTheme: (theme) => {
    localStorage.setItem('mu-theme', theme);
    set({ theme });
  },
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setTracks: (tracks) => set({ tracks }),
  setSearch: (search) => set({ search }),
  setCrossfader: (crossfader) => set({ crossfader }),
  setMasterVolume: (masterVolume) => set({ masterVolume }),
  setActiveTrack: (activeTrackId) => set({ activeTrackId }),
  updateDeck: (id, snapshot) => set((state) => ({ decks: { ...state.decks, [id]: snapshot } })),
  notify: (toast) => set({ toast }),
}));
