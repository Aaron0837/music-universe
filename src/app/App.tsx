import { lazy, Suspense, useEffect, useState } from 'react';
import { getMixer } from '../audio/engine/runtime';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import { AppShell } from './AppShell';
import { DiscoverPage } from '../pages/DiscoverPage';
import { LibraryPage } from '../pages/LibraryPage';

const DJPage = lazy(() => import('../pages/DJPage').then((module) => ({ default: module.DJPage })));
const PlaylistsPage = lazy(() => import('../pages/PlaylistsPage').then((module) => ({ default: module.PlaylistsPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const VisualsPage = lazy(() => import('../pages/VisualsPage').then((module) => ({ default: module.VisualsPage })));

export function App() {
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const setTracks = useAppStore((state) => state.setTracks);
  const updateDeck = useAppStore((state) => state.updateDeck);
  const notify = useAppStore((state) => state.notify);
  const [draggingFiles, setDraggingFiles] = useState(false);

  useEffect(() => { void libraryRepository.listTracks().then(setTracks).catch(() => notify('无法打开本地曲库')); }, [notify, setTracks]);
  useEffect(() => {
    const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#080a10' : '#f5f5f7');
  }, [theme]);
  useEffect(() => {
    const mixer = getMixer();
    mixer.decks.A.onSnapshot((snapshot) => updateDeck('A', snapshot));
    mixer.decks.B.onSnapshot((snapshot) => updateDeck('B', snapshot));
    const interval = window.setInterval(() => {
      updateDeck('A', mixer.decks.A.snapshot());
      updateDeck('B', mixer.decks.B.snapshot());
    }, 180);
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') { event.preventDefault(); void mixer.decks.A.toggle(); }
      if (event.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
    };
    window.addEventListener('keydown', keydown);
    return () => { window.clearInterval(interval); window.removeEventListener('keydown', keydown); };
  }, [updateDeck]);
  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      depth += 1;
      setDraggingFiles(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDraggingFiles(false);
    };
    const over = (event: DragEvent) => event.preventDefault();
    const drop = async (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDraggingFiles(false);
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|ogg)$/i.test(file.name));
      if (!files.length) return notify('请拖入 MP3、FLAC、WAV、M4A 或 OGG 文件');
      notify(`正在导入 ${files.length} 首音乐…`);
      try {
        await libraryRepository.importFiles(files);
        setTracks(await libraryRepository.listTracks());
        notify(`已导入 ${files.length} 首音乐`);
      } catch (error) {
        notify(error instanceof Error ? error.message : '导入失败');
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [notify, setTracks]);
  useEffect(() => {
    if (!useAppStore.getState().toast) return;
    const timeout = window.setTimeout(() => notify(undefined), 3200);
    return () => window.clearTimeout(timeout);
  });

  const page = view === 'discover' ? <DiscoverPage /> : view === 'library' ? <LibraryPage /> : view === 'playlists' ? <PlaylistsPage /> : view === 'dj' ? <DJPage /> : view === 'visuals' ? <VisualsPage /> : <SettingsPage />;
  return <><AppShell><Suspense fallback={<div className="page-loading">正在准备体验…</div>}>{page}</Suspense></AppShell>{draggingFiles && <div className="global-drop"><strong>释放以导入音乐</strong><span>文件只会保存在当前设备</span></div>}</>;
}
