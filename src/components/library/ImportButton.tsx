import { Upload } from 'lucide-react';
import { libraryRepository } from '../../data/WebLibraryRepository';
import { webPlatform } from '../../platform/PlatformAdapter';
import { useAppStore } from '../../stores/useAppStore';

export function ImportButton({ compact = false }: { compact?: boolean }) {
  const setTracks = useAppStore((state) => state.setTracks);
  const notify = useAppStore((state) => state.notify);
  const importFiles = async () => {
    const files = await webPlatform.pickAudioFiles();
    if (!files.length) return;
    notify(`正在导入 ${files.length} 首音乐…`);
    try {
      const outcome = await libraryRepository.importFiles(files);
      // Refresh even when some files failed. The ones that landed are already in
      // the database; skipping the refresh on error is what used to hide them.
      setTracks(await libraryRepository.listTracks());
      if (!outcome.failures.length) notify(`已导入 ${outcome.imported.length} 首音乐，仅保存在本机`);
      else notify(`已导入 ${outcome.imported.length} 首，${outcome.failures.length} 首失败：${outcome.failures[0].reason}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法导入该音频');
    }
  };
  return <button className={compact ? 'icon-action' : 'primary-action'} type="button" onClick={() => void importFiles()}><Upload size={18} /><span>{compact ? '导入' : '导入本地音乐'}</span></button>;
}
