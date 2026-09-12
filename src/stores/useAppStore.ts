import { create } from 'zustand';
import type { AppView, DeckId, DeckQueue, DeckSnapshot, ThemeMode, Track } from '../types/models';

const emptyDeck: DeckSnapshot = {
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.86,
  bpm: 120,
  sourceBpm: 120,
  keyShift: 0,
  keyLock: false,
  keyLockAvailable: false,
  low: 0,
  mid: 0,
  high: 0,
  filter: 1,
  effects: { delay: 0, reverb: 0, flanger: 0 },
  loopBeats: 4,
  loopEnabled: false,
  reverse: false,
  status: 'empty',
  analysisPending: false,
  cues: [null, null, null, null],
  revision: 0,
};

interface AppStore {
  activeDeck: DeckId;
  setActiveDeck(id: DeckId): void;
  view: AppView;
  theme: ThemeMode;
  sidebarOpen: boolean;
  tracks: Track[];
  search: string;
  crossfader: number;
  masterVolume: number;
  activeTrackId?: string;
  decks: Record<DeckId, DeckSnapshot>;
  /** Playlist playing on a deck, advanced when a track ends naturally. */
  queue: DeckQueue | null;
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
  setQueue(trackIds: string[], deck: DeckId, index: number): void;
  setQueueIndex(index: number): void;
  clearQueue(): void;
  notify(message?: string): void;
}

const savedTheme = (localStorage.getItem('mu-theme') as ThemeMode | null) ?? 'light';

export const useAppStore = create<AppStore>((set) => ({
  activeDeck: 'A',
  setActiveDeck: (activeDeck) => set({ activeDeck }),
  view: 'discover',
  theme: savedTheme,
  sidebarOpen: window.innerWidth >= 840,
  tracks: [],
  search: '',
  crossfader: 0,
  masterVolume: 0.8,
  decks: { A: { ...emptyDeck }, B: { ...emptyDeck } },
  queue: null,
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
  setQueue: (trackIds, deck, index) => set({ queue: { trackIds: [...trackIds], deck, index } }),
  setQueueIndex: (index) => set((state) => (state.queue ? { queue: { ...state.queue, index } } : {})),
  clearQueue: () => set({ queue: null }),
  notify: (toast) => set({ toast }),
}));
