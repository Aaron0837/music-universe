import { create } from 'zustand';
import { addRecent, toggleFavorite as toggleFavoriteId } from '../library/collection';
import { nextPlayMode, shuffledOrder } from '../playlists/playlistMath';
import type { AppView, DeckId, DeckQueue, DeckSnapshot, PlayMode, ThemeMode, Track } from '../types/models';

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
  /** Immersive full-screen player with artwork, lyrics and controls. */
  nowPlaying: boolean;
  /** How the queue advances past the track that just finished. */
  playMode: PlayMode;
  favorites: string[];
  /** Track ids, newest play first. */
  recent: string[];
  /** Epoch ms the sleep timer fires, or undefined when it is off. */
  sleepEndsAt?: number;
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
  /** Replaces the shuffle permutation the queue walks. */
  setQueueOrder(order: number[]): void;
  clearQueue(): void;
  setNowPlaying(open: boolean): void;
  setPlayMode(mode: PlayMode): void;
  cyclePlayMode(): void;
  toggleFavorite(trackId: string): void;
  recordPlay(trackId: string): void;
  setSleepTimer(minutes?: number): void;
  clearSleepTimer(): void;
  /** Replaces the lists after reading them back from storage. */
  hydrateCollection(favorites: string[], recent: string[], playMode: PlayMode): void;
  notify(message?: string): void;
}

const savedTheme = (localStorage.getItem('mu-theme') as ThemeMode | null) ?? 'light';

/**
 * Saves and loads the small lists the user builds up. Injected by the app so the
 * store stays free of a direct storage import (and easy to test in isolation).
 */
export const collectionSink: { save?: (favorites: string[], recent: string[], playMode: PlayMode) => void } = {};

function persist(state: Pick<AppStore, 'favorites' | 'recent' | 'playMode'>): void {
  collectionSink.save?.(state.favorites, state.recent, state.playMode);
}

export const useAppStore = create<AppStore>((set, get) => ({
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
  nowPlaying: false,
  playMode: 'sequential',
  favorites: [],
  recent: [],
  sleepEndsAt: undefined,
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
  // A fresh queue rebuilds its shuffle order so the first random pick is real.
  setQueue: (trackIds, deck, index) => set(() => {
    const playMode = get().playMode;
    return { queue: { trackIds: [...trackIds], deck, index, order: playMode === 'shuffle' ? shuffledOrder(trackIds.length) : undefined } };
  }),
  setQueueIndex: (index) => set((state) => (state.queue ? { queue: { ...state.queue, index } } : {})),
  setQueueOrder: (order) => set((state) => (state.queue ? { queue: { ...state.queue, order } } : {})),
  clearQueue: () => set({ queue: null }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setPlayMode: (playMode) => set((state) => {
    // Entering shuffle mid-queue needs an order immediately, not at track end.
    const order = playMode === 'shuffle' ? state.queue?.order ?? (state.queue ? shuffledOrder(state.queue.trackIds.length) : undefined) : undefined;
    const queue = state.queue ? { ...state.queue, order } : null;
    persist({ ...state, playMode });
    return { playMode, queue };
  }),
  cyclePlayMode: () => get().setPlayMode(nextPlayMode(get().playMode)),
  toggleFavorite: (trackId) => set((state) => {
    const favorites = toggleFavoriteId(state.favorites, trackId);
    persist({ ...state, favorites });
    return { favorites };
  }),
  recordPlay: (trackId) => set((state) => {
    const recent = addRecent(state.recent, trackId);
    // Replaying the newest entry changes nothing, so skip the write.
    if (recent[0] === state.recent[0] && recent.length === state.recent.length) return {};
    persist({ ...state, recent });
    return { recent };
  }),
  setSleepTimer: (minutes) => set({ sleepEndsAt: minutes ? Date.now() + minutes * 60_000 : undefined }),
  clearSleepTimer: () => set({ sleepEndsAt: undefined }),
  hydrateCollection: (favorites, recent, playMode) => set({ favorites, recent, playMode }),
  notify: (toast) => set({ toast }),
}));
