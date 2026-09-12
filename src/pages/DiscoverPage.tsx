import { ArrowDown, ArrowUpRight, Leaf, Play, AudioLines } from 'lucide-react';
import { useMusicActions } from '../hooks/useMusicActions';
import { useAppStore } from '../stores/useAppStore';
import { Artwork } from '../components/ui/Artwork';
import { ImportButton } from '../components/library/ImportButton';

const moods = [
  { title: '慢一点，也很好', subtitle: 'SLOW MORNINGS', className: 'cover-sun', symbol: '◒', visual: 'waves' },
  { title: '风经过的地方', subtitle: 'OPEN AIR', className: 'cover-space', symbol: '✳', visual: 'nebula' },
  { title: '让灵感自由生长', subtitle: 'CREATIVE FLOW', className: 'cover-neon', symbol: '〰', visual: 'bloom' },
];

export function DiscoverPage() {
  const { playDemo, loadTrack } = useMusicActions();
  const tracks = useAppStore((state) => state.tracks);
  const recent = useAppStore((state) => state.recent);
  const setView = useAppStore((state) => state.setView);
  // Prefer what the user actually played; fall back to what they just imported.
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const played = recent.map((id) => byId.get(id)).filter((track) => track !== undefined).slice(0, 3);
  const highlight = played.length ? played : tracks.slice(0, 3);
  const highlightTitle = played.length ? '最近在听' : '最近加入';
  return <section className="page discover-page">
    <div className="welcome-line"><span><Leaf size={14} /> A LITTLE ROOM FOR SOUND</span><span>你的音乐，你的节奏。</span></div>
    <div className="hero-panel">
      <div className="hero-copy">
        <span className="eyebrow">TUNE IN. SLOW DOWN.</span>
        <h1>好音乐，<br />让此刻<span className="fresh-word">轻盈一点<svg viewBox="0 0 270 20" aria-hidden="true"><path d="M4 13 Q110 -3 264 10 M20 18 Q130 5 242 15" /></svg></span>。</h1>
        <p>把喜欢的声音放进来。<br />听一首歌，或创造一点不一样的节奏。</p>
        <div className="hero-actions"><button className="primary-action" type="button" onClick={() => void playDemo()}><Play size={16} fill="currentColor" />播放原创示例</button><ImportButton /></div>
        <div className="hero-footnote"><span className="tiny-dot" /> 无需账号 · 音乐只在本机播放</div>
      </div>
      <button className="sound-garden" type="button" aria-label="播放花园中的原创音乐" onClick={() => void playDemo()}>
        <span className="garden-orbit orbit-one" /><span className="garden-orbit orbit-two" />
        <span className="garden-disc"><span className="disc-center"><AudioLines /></span></span>
        <span className="garden-leaf leaf-one" /><span className="garden-leaf leaf-two" />
        <span className="garden-pebble" /><span className="garden-star">✳</span>
        <span className="garden-label"><span className="tiny-dot" /> ORIGINAL SESSION <b>Orbital Signal</b><small>124 BPM · 让声音慢慢展开</small></span>
        <span className="garden-coordinate">SOUND / 001</span>
      </button>
    </div>
    <div className="section-divider"><span>EXPLORE YOUR MOOD</span><ArrowDown size={15} /></div>
    <header className="section-heading"><div><h2>今天，听见什么颜色？</h2><p>让视觉随音乐流动，给心情一点留白。</p></div><button type="button" onClick={() => setView('visuals')}>探索视觉 <ArrowUpRight size={16} /></button></header>
    <div className="mood-grid">
      {moods.map((mood, index) => <button className="mood-card" type="button" key={mood.title} onClick={() => { sessionStorage.setItem('mu-visual', mood.visual); setView('visuals'); }}>
        <span className={mood.className}><small>0{index + 1} / {mood.subtitle}</small><b>{mood.symbol}</b><em>MUSIC UNIVERSE</em></span>
        <div><h3>{mood.title}</h3><p>{mood.subtitle.toLowerCase().replaceAll('_', ' ')}</p><ArrowUpRight size={19} /></div>
      </button>)}
    </div>
    <div className="discovery-bottom">
      <section data-testid="discover-recent"><header className="section-heading"><div><h2>{highlightTitle}</h2><p>{played.length ? '按你最近播放的顺序。' : '每一首，都是你的选择。'}</p></div><button type="button" onClick={() => setView('library')}>全部曲库 <ArrowUpRight size={16} /></button></header>
      <div className="recent-list">{highlight.map((track, index) => <button type="button" key={track.id} onClick={() => void loadTrack(track.id)}><b>0{index + 1}</b><Artwork artwork={track.artwork} /><span><strong>{track.title}</strong><small>{track.artist}</small></span><em>{track.album}</em><i><Play size={14} /></i></button>)}
      {!tracks.length && <div className="empty-row"><span>你的下一首心动，还在路上。</span><small>导入本地音乐，在这里收藏日常的声音。</small><ImportButton compact /></div>}</div></section>
      <button className="studio-invite" type="button" onClick={() => setView('dj')}><span>FROM LISTENER TO CREATOR</span><AudioLines /><h3>不只听，也来玩。</h3><p>进入 DJ 工作台，让每个节拍都有你的参与。</p><b>打开 DJ 台 <ArrowUpRight size={16} /></b></button>
    </div>
  </section>;
}
