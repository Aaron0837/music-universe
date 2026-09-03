import { Database, Gauge, Keyboard, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useAppStore } from '../stores/useAppStore';
import type { ThemeMode } from '../types/models';

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const notify = useAppStore((state) => state.notify);
  const [storage, setStorage] = useState({ usage: 0, quota: 0, persistent: false });
  useEffect(() => { void libraryRepository.storage().then(setStorage); }, []);
  const set = (mode: ThemeMode) => setTheme(mode);
  const persist = async () => {
    const accepted = await libraryRepository.requestPersistence();
    setStorage(await libraryRepository.storage());
    notify(accepted ? '浏览器已允许持久保存曲库' : '浏览器暂未授予持久存储');
  };
  const percentage = storage.quota ? storage.usage / storage.quota * 100 : 0;
  return <section className="page settings-page"><header className="page-heading"><div><span>PREFERENCES</span><h1>设置</h1><p>界面、性能与本地数据均由你掌控。</p></div></header><div className="settings-grid"><article><header><Sun /><div><h2>外观</h2><p>默认使用简约浅色玻璃主题</p></div></header><div className="theme-options"><button className={theme === 'light' ? 'active' : ''} type="button" onClick={() => set('light')}><Sun />浅色</button><button className={theme === 'dark' ? 'active' : ''} type="button" onClick={() => set('dark')}><Moon />深色</button><button className={theme === 'system' ? 'active' : ''} type="button" onClick={() => set('system')}>自动</button></div></article><article><header><Database /><div><h2>本地存储</h2><p>{storage.persistent ? '已启用持久保存' : '当前由浏览器自动管理'}</p></div></header><div className="storage-meter"><i style={{ width: `${Math.max(2, percentage)}%` }} /></div><small>{(storage.usage / 1024 / 1024).toFixed(1)} MB / {storage.quota ? `${(storage.quota / 1024 / 1024 / 1024).toFixed(1)} GB` : '未知配额'}</small><button className="secondary-action" type="button" onClick={() => void persist()}>请求持久保存</button></article><article><header><Gauge /><div><h2>性能</h2><p>自动根据屏幕与设备调整视觉质量</p></div></header><label className="switch-row">减少动态效果<input type="checkbox" defaultChecked={matchMedia('(prefers-reduced-motion: reduce)').matches} /></label></article><article><header><Keyboard /><div><h2>快捷键</h2><p>播放与 DJ 操作</p></div></header><dl><div><dt>Space</dt><dd>播放 / 暂停</dd></div><div><dt>A S D F</dt><dd>音游击键</dd></div><div><dt>1 / 2</dt><dd>切换 Deck</dd></div><div><dt>F</dt><dd>全屏</dd></div></dl></article></div></section>;
}
