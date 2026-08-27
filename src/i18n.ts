const copy = {
  en: { kicker: 'AN AUDIO-REACTIVE INSTRUMENT', heroA: "DON'T JUST", heroB: 'HEAR IT.', heroC: 'SHAPE IT.', lede: 'Drop in any song. Move through its frequencies. Turn sound into a universe only you can make.', upload: 'DROP OR CHOOSE A TRACK', demo: 'PLAY GENERATED DEMO', privacy: 'YOUR AUDIO NEVER LEAVES THIS DEVICE', drop: 'RELEASE TO ENTER THE UNIVERSE', volume: 'VOL', sensitivity: 'SENSE', hue: 'HUE' },
  zh: { kicker: '一件音频驱动的视觉乐器', heroA: '不要只去', heroB: '聆听。', heroC: '塑造它。', lede: '放入任意歌曲，穿行于频率之间，把声音变成只属于你的宇宙。', upload: '拖入或选择一首歌曲', demo: '播放原创生成音轨', privacy: '你的音频永远不会离开此设备', drop: '松开以进入音乐宇宙', volume: '音量', sensitivity: '响应', hue: '色相' }
} as const;

export function applyLanguage(language: 'en' | 'zh'): void {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => { const key = node.dataset.i18n as keyof typeof copy.en; node.textContent = copy[language][key]; });
}
