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
      await libraryRepository.importFiles(files);
      setTracks(await libraryRepository.listTracks());
      notify(`已导入 ${files.length} 首音乐，仅保存在本机`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法导入该音频');
    }
  };
  return <button className={compact ? 'icon-action' : 'primary-action'} type="button" onClick={() => void importFiles()}><Upload size={18} /><span>{compact ? '导入' : '导入本地音乐'}</span></button>;
}
