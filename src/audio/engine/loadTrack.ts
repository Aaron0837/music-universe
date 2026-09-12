import { getMixer } from './runtime';
import { libraryRepository } from '../../data/WebLibraryRepository';
import { useAppStore } from '../../stores/useAppStore';
import type { DeckId } from '../../types/models';

const requests: Record<DeckId, number> = { A: 0, B: 0 };

/**
 * Loads a library track into a deck. Shared by the UI hook and the playlist
 * queue so both paths dedupe races and unlock audio the same way.
 *
 * Returns false when a newer request for the same deck superseded this one.
 */
export async function loadTrackInto(
  trackId: string,
  deckId: DeckId = 'A',
  autoplay = true,
  notify: (message?: string) => void = () => {},
): Promise<boolean> {
  const request = ++requests[deckId];
  const mixer = getMixer();
  notify(`正在载入 Deck ${deckId}…`);
  try {
    // Unlock immediately in the user's gesture, before awaiting IndexedDB.
    await mixer.unlock();
    const [track, analysis] = await Promise.all([libraryRepository.getTrack(trackId), libraryRepository.getAnalysis(trackId)]);
    if (request !== requests[deckId]) return false;
    if (!track) throw new Error('找不到这首音乐，请重新导入');
    mixer.decks[deckId].onAnalysis = (id, result) => { void libraryRepository.saveAnalysis(id, result).catch(() => notify('分析结果未能缓存，下次将重新分析')); };
    const loaded = await mixer.decks[deckId].load(track.id, track.audio, analysis);
    if (!loaded || request !== requests[deckId]) return false;
    useAppStore.getState().setActiveDeck(deckId);
    useAppStore.getState().setActiveTrack(track.id);
    if (autoplay) await mixer.decks[deckId].play();
    notify(`${track.title} 已载入 Deck ${deckId}`);
    return true;
  } catch (error) {
    if (request === requests[deckId]) notify(error instanceof Error ? error.message : '音频解码失败');
    return false;
  }
}

/** True while a newer load request is in flight for this deck. */
export function isSuperseded(deckId: DeckId, request: number): boolean {
  return requests[deckId] !== request;
}
