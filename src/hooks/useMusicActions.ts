import { useCallback } from 'react';
import { loadTrackInto } from '../audio/engine/loadTrack';
import { getMixer } from '../audio/engine/runtime';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId } from '../types/models';

export function useMusicActions() {
  const notify = useAppStore((state) => state.notify);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);

  const loadTrack = useCallback(async (trackId: string, deckId: DeckId = 'A', autoplay = true) => {
    // A manual pick replaces whatever playlist was playing on this deck.
    const { queue, clearQueue } = useAppStore.getState();
    if (queue && queue.deck === deckId) clearQueue();
    await loadTrackInto(trackId, deckId, autoplay, notify);
  }, [notify]);

  const playDemo = useCallback(async (deckId: DeckId = 'A') => {
    try {
      const mixer = getMixer();
      await mixer.unlock();
      // A manual pick on this deck replaces whatever playlist was playing.
      useAppStore.getState().clearQueue();
      mixer.decks[deckId].loadBuffer('demo', mixer.createDemo(), 124);
      setActiveTrack('demo'); useAppStore.getState().setActiveDeck(deckId);
      await mixer.decks[deckId].play();
      notify(`原创示例已在 Deck ${deckId} 启动，请调整设备音量`);
    } catch { notify('音频启动失败，请再次点击播放并检查浏览器声音权限'); }
  }, [notify, setActiveTrack]);
  return { loadTrack, playDemo };
}
