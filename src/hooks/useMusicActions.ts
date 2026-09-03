import { useCallback } from 'react';
import { getMixer } from '../audio/engine/runtime';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId } from '../types/models';

export function useMusicActions() {
  const notify = useAppStore((state) => state.notify);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);

  const loadTrack = useCallback(async (trackId: string, deckId: DeckId = 'A', autoplay = true) => {
    const mixer = getMixer();
    notify(`正在载入 Deck ${deckId}…`);
    try {
      const track = await libraryRepository.getTrack(trackId);
      if (!track) throw new Error('找不到这首音乐，请重新导入');
      await mixer.unlock();
      await mixer.decks[deckId].load(track.id, track.audio, track.bpm ?? 120);
      setActiveTrack(track.id);
      if (autoplay) await mixer.decks[deckId].play();
      notify(`${track.title} 已载入 Deck ${deckId}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '音频解码失败');
    }
  }, [notify, setActiveTrack]);

  const playDemo = useCallback(async (deckId: DeckId = 'A') => {
    const mixer = getMixer();
    await mixer.unlock();
    mixer.decks[deckId].loadBuffer('demo', mixer.createDemo(), 124);
    setActiveTrack('demo');
    await mixer.decks[deckId].play();
    notify(`原创示例已在 Deck ${deckId} 发声`);
  }, [notify, setActiveTrack]);

  return { loadTrack, playDemo };
}
