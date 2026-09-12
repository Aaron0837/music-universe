import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePreferences } from '../stores/usePreferences';
import { Album, AudioLines, Heart, Library, ListMusic, Menu, Moon, Search, Settings, Sparkles, Sun, X } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { ImportButton } from '../components/library/ImportButton';
import { PlayerDock } from '../components/player/PlayerDock';
import { AmbientField } from '../components/ui/AmbientField';
import { useAppStore } from '../stores/useAppStore';
import type { AppView } from '../types/models';

const navigation: Array<{ id: AppView; label: string; icon: typeof Album }> = [
  { id: 'discover', label: '发现', icon: Sparkles },
  { id: 'library', label: '曲库', icon: Library },
  { id: 'collection', label: '我的音乐', icon: Heart },
  { id: 'playlists', label: '播放列表', icon: ListMusic },
  { id: 'dj', label: 'DJ 台', icon: AudioLines },
  { id: 'visuals', label: '可视化', icon: Album },
  { id: 'settings', label: '设置', icon: Settings },
];

export function AppShell({ children }: PropsWithChildren) {
  const systemReduced = useReducedMotion();
  const preferredReduced = usePreferences((state) => state.reducedMotion);
  const reduced = systemReduced || preferredReduced;
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const search = useAppStore((state) => state.search);
  const setView = useAppStore((state) => state.setView);
  const setSidebar = useAppStore((state) => state.setSidebar);
  const setSearch = useAppStore((state) => state.setSearch);
  const setTheme = useAppStore((state) => state.setTheme);
  const toast = useAppStore((state) => state.toast);
  return (
    <div className={`app-shell ${view === 'dj' ? 'performance-shell' : ''}`}>
      <AmbientField intensity={view === 'discover' ? 1 : 0.4} disabled={view === 'dj' || view === 'visuals'} />
      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="关闭侧栏" onClick={() => setSidebar(false)} />}
      <aside inert={!sidebarOpen} className={`sidebar ${sidebarOpen ? '' : 'sidebar--closed'}`}>
        <div className="brand-mark"><span><AudioLines /></span><div><strong>Music Universe<span className="brand-dot">.</span></strong><small>留一点空间，给音乐</small></div></div>
        <nav aria-label="主要区域">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button className={view === id ? 'active' : ''} key={id} type="button" onClick={() => { setView(id); if (innerWidth < 840) setSidebar(false); }}>
              <Icon size={20} /><span>{label}</span>{id === 'dj' && <i>PRO</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-import"><span className="nav-caption">YOUR LITTLE UNIVERSE</span><ImportButton /></div>
        <div className="privacy-note"><span>●</span><div><strong>100% 本地处理</strong><small>音乐不会离开此设备</small></div></div>
      </aside>
      <main className="main-stage">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="切换侧栏" onClick={() => setSidebar(!sidebarOpen)}>{sidebarOpen ? <X /> : <Menu />}</button>
          <label className="global-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索音乐、歌手或专辑" /></label>
          <ImportButton compact />
          <button className="theme-button" type="button" aria-label="切换明暗主题" onClick={() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <span className="profile-chip">MU</span>
        </header>
        <div className="page-scroll">
          <AnimatePresence mode="wait">
            <motion.div className="page-motion" key={view} initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0 : 0.24 }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        <PlayerDock />
      </main>
      <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>
    </div>
  );
}
