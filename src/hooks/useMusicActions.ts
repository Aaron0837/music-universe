import { useCallback } from 'react';
import { getMixer } from '../audio/engine/runtime';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId } from '../types/models';

const requests: Record<DeckId, number> = { A: 0, B: 0 };
export function useMusicActions() {
  const notify = useAppStore((state) => state.notify);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const loadTrack = useCallback(async (trackId: string, deckId: DeckId = 'A', autoplay = true) => {
    const request = ++requests[deckId];
    const mixer = getMixer();
    notify(`正在载入 Deck ${deckId}…`);
    try {
      // Unlock immediately in the user's gesture, before awaiting IndexedDB.
      await mixer.unlock();
      const [track, analysis] = await Promise.all([libraryRepository.getTrack(trackId), libraryRepository.getAnalysis(trackId)]);
      if (request !== requests[deckId]) return;
      if (!track) throw new Error('找不到这首音乐，请重新导入');
      mixer.decks[deckId].onAnalysis = (id, result) => { void libraryRepository.saveAnalysis(id, result).catch(() => notify('分析结果未能缓存，下次将重新分析')); };
      const loaded = await mixer.decks[deckId].load(track.id, track.audio, analysis);
      if (!loaded || request !== requests[deckId]) return;
      useAppStore.getState().setActiveDeck(deckId); setActiveTrack(track.id);
      if (autoplay) await mixer.decks[deckId].play();
      notify(`${track.title} 已载入 Deck ${deckId}`);
    } catch (error) {
      if (request === requests[deckId]) notify(error instanceof Error ? error.message : '音频解码失败');
    }
  }, [notify, setActiveTrack]);

  const playDemo = useCallback(async (deckId: DeckId = 'A') => {
    const request = ++requests[deckId];
    try {
      const mixer = getMixer();
      await mixer.unlock();
      if (request !== requests[deckId]) return;
      mixer.decks[deckId].loadBuffer('demo', mixer.createDemo(), 124);
      setActiveTrack('demo'); useAppStore.getState().setActiveDeck(deckId);
      await mixer.decks[deckId].play();
      notify(`原创示例已在 Deck ${deckId} 启动，请调整设备音量`);
    } catch { notify('音频启动失败，请再次点击播放并检查浏览器声音权限'); }
  }, [notify, setActiveTrack]);
  return { loadTrack, playDemo };
}
