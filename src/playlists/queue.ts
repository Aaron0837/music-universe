import { loadTrackInto } from '../audio/engine/loadTrack';
import { peekMixer } from '../audio/engine/runtime';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId, Playlist } from '../types/models';
import { nextQueueIndex, nextShuffleIndex, pruneMissing, shuffledOrder } from './playlistMath';

/**
 * Starts a playlist on a deck, skipping entries whose track was removed
 * from the library since the playlist was saved.
 */
export async function startQueue(playlist: Playlist, deckId: DeckId = 'A'): Promise<boolean> {
  const available = await libraryRepository.listTracks();
  const queue = pruneMissing(playlist.trackIds, available.map((track) => track.id));
  if (!queue.length) {
    useAppStore.getState().notify('这个歌单还没有音乐，先从曲库添加');
    return false;
  }
  const { playMode, setQueue } = useAppStore.getState();
  setQueue(queue, deckId, 0);
  // Shuffle should pick a real random opener, not always the first row.
  if (playMode === 'shuffle') {
    const order = shuffledOrder(queue.length);
    useAppStore.getState().setQueueOrder(order);
    return loadTrackInto(queue[order[0] ?? 0], deckId, true, useAppStore.getState().notify);
  }
  return loadTrackInto(queue[0], deckId, true, useAppStore.getState().notify);
}

/**
 * Advances the active queue when a deck finishes a track. Called from the deck's
 * natural end-of-track event, so a manual stop does not skip forward.
 *
 * Honours the current play mode: repeat-one replays, repeat-all wraps, shuffle
 * walks its permutation, and the default stops at the end.
 */
export async function advanceQueue(deckId: DeckId): Promise<void> {
  const { queue, clearQueue, setQueueIndex, playMode, setQueueOrder } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) return;

  if (playMode === 'shuffle') {
    const { index, order } = nextShuffleIndex(queue.order ?? [], queue.index, queue.trackIds.length);
    setQueueOrder(order);
    setQueueIndex(index);
    const loaded = await loadTrackInto(queue.trackIds[index], deckId, true, useAppStore.getState().notify);
    if (!loaded) clearQueue();
    return;
  }

  const next = nextQueueIndex(queue.index, queue.trackIds.length, playMode);
  if (next === undefined) {
    clearQueue();
    return;
  }
  setQueueIndex(next);
  const trackId = queue.trackIds[next];
  const loaded = await loadTrackInto(trackId, deckId, true, useAppStore.getState().notify);
  // A deleted or unreadable track should not stall the rest of the queue.
  if (!loaded) clearQueue();
}

/** Moves within the queue, used by the playlist page's previous/next controls. */
export async function jumpQueue(deckId: DeckId, index: number): Promise<void> {
  const { queue, setQueueIndex } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) return;
  if (index < 0 || index >= queue.trackIds.length) return;
  setQueueIndex(index);
  await loadTrackInto(queue.trackIds[index], deckId, true, useAppStore.getState().notify);
}

/** Step forward or back through the queue outside of natural track endings. */
export async function stepQueue(deckId: DeckId, delta: number): Promise<void> {
  const { queue } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) return;
  const total = queue.trackIds.length;
  if (total < 2) return;
  const index = ((queue.index + delta) % total + total) % total;
  await jumpQueue(deckId, index);
}

/**
 * Entry point for a deck that finished its track.
 *
 * A deck playing a single track picked straight from the library has no queue,
 * so the queue-based modes would do nothing at all. Repeat-one is the one mode
 * that still means something there: start the same track again.
 */
export async function handleTrackEnd(deckId: DeckId): Promise<void> {
  const { queue, playMode } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) {
    if (playMode === 'repeat-one') await replayDeck(deckId);
    return;
  }
  await advanceQueue(deckId);
}

/**
 * Replays whatever the deck already holds.
 *
 * `play()` rewinds on its own when the position sits at the very end, so the
 * finished track restarts instead of being skipped.
 */
async function replayDeck(deckId: DeckId): Promise<void> {
  const mixer = peekMixer();
  if (!mixer) return;
  const deck = mixer.decks[deckId];
  if (!deck.snapshot().trackId) return;
  try {
    await deck.play();
  } catch {
    // A browser that refuses playback (no gesture, no device) simply stays paused.
  }
}
