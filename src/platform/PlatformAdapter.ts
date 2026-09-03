export interface PlatformAdapter {
  readonly kind: 'web' | 'tauri';
  pickAudioFiles(): Promise<File[]>;
  isFullscreen(): boolean;
  toggleFullscreen(): Promise<void>;
}

export const webPlatform: PlatformAdapter = {
  kind: 'web',
  async pickAudioFiles() {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/mpeg,audio/flac,audio/wav,audio/mp4,audio/aac,audio/ogg,.mp3,.flac,.wav,.m4a,.ogg';
      input.onchange = () => resolve(Array.from(input.files ?? []));
      input.oncancel = () => resolve([]);
      input.click();
    });
  },
  isFullscreen: () => Boolean(document.fullscreenElement),
  async toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  },
};
