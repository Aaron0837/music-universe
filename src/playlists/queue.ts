import { loadTrackInto } from '../audio/engine/loadTrack';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId, Playlist } from '../types/models';
import { nextIndex, pruneMissing } from './playlistMath';

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
  useAppStore.getState().setQueue(queue, deckId, 0);
  return loadTrackInto(queue[0], deckId, true, useAppStore.getState().notify);
}

/**
 * Advances the active queue when a deck finishes a track. Called from the deck's
 * natural end-of-track event, so a manual stop does not skip forward.
 */
export async function advanceQueue(deckId: DeckId): Promise<void> {
  const { queue, clearQueue, setQueueIndex } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) return;
  const next = nextIndex(queue.index, queue.trackIds.length);
  if (next === undefined) { clearQueue(); return; }
  const trackId = queue.trackIds[next];
  setQueueIndex(next);
  const loaded = await loadTrackInto(trackId, deckId, true, useAppStore.getState().notify);
  // A deleted or unreadable track should not stall the rest of the queue.
  if (!loaded) { clearQueue(); }
}

/** Moves within the queue, used by the playlist page's previous/next controls. */
export async function jumpQueue(deckId: DeckId, index: number): Promise<void> {
  const { queue, setQueueIndex } = useAppStore.getState();
  if (!queue || queue.deck !== deckId) return;
  if (index < 0 || index >= queue.trackIds.length) return;
  setQueueIndex(index);
  await loadTrackInto(queue.trackIds[index], deckId, true, useAppStore.getState().notify);
}
