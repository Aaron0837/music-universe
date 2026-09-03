import { ArrowRight, Headphones, Play, Sparkles } from 'lucide-react';
import { useMusicActions } from '../hooks/useMusicActions';
import { useAppStore } from '../stores/useAppStore';
import { Artwork } from '../components/ui/Artwork';

const moods = [
  { title: '宇宙漫游', subtitle: 'Ambient · Electronic', className: 'cover-space' },
  { title: '柔软晴天', subtitle: 'Indie · Chill', className: 'cover-sun' },
  { title: '夜色霓虹', subtitle: 'Future · Dance', className: 'cover-neon' },
];

export function DiscoverPage() {
  const { playDemo, loadTrack } = useMusicActions();
  const tracks = useAppStore((state) => state.tracks);
  const setView = useAppStore((state) => state.setView);
  return (
    <section className="page discover-page">
      <div className="hero-panel">
        <div className="hero-copy"><span className="eyebrow"><Sparkles size={15} /> MUSIC, REIMAGINED</span><h1>让每一首歌，<br /><em>拥有自己的宇宙。</em></h1><p>听歌、混音、触碰实时视觉。音乐只在你的设备上发生。</p><div><button className="primary-action" type="button" onClick={() => void playDemo()}><Play size={18} />播放原创示例</button><button className="secondary-action" type="button" onClick={() => setView('dj')}>打开 DJ 台 <ArrowRight size={17} /></button></div></div>
        <button className="hero-orb" type="button" aria-label="播放原创示例" onClick={() => void playDemo()}><i /><b><Headphones /></b><span>ORBITAL<br />SIGNAL</span></button>
      </div>
      <header className="section-heading"><div><span>精选体验</span><h2>从一种心情开始</h2></div><button type="button" onClick={() => setView('visuals')}>全部视觉 <ArrowRight size={16} /></button></header>
      <div className="mood-grid">
        <button className="mood-card daily" type="button" onClick={() => void playDemo()}><span><small>MU</small><strong>03</strong></span><h3>每日信号</h3><p>原创电子示例 · 124 BPM</p><i><Play /></i></button>
        {moods.map((mood) => <button className="mood-card" type="button" key={mood.title} onClick={() => setView('visuals')}><span className={mood.className} /><h3>{mood.title}</h3><p>{mood.subtitle}</p><i><Play /></i></button>)}
      </div>
      <header className="section-heading"><div><span>你的声音</span><h2>最近加入</h2></div><button type="button" onClick={() => setView('library')}>打开曲库 <ArrowRight size={16} /></button></header>
      <div className="recent-list">
        {tracks.slice(0, 4).map((track, index) => <button type="button" key={track.id} onClick={() => void loadTrack(track.id)}><b>{String(index + 1).padStart(2, '0')}</b><Artwork artwork={track.artwork} /><span><strong>{track.title}</strong><small>{track.artist}</small></span><em>{track.album}</em><i>{track.bpm ? `${Math.round(track.bpm)} BPM` : 'LOCAL'}</i></button>)}
        {!tracks.length && <div className="empty-row"><span>曲库还是空的</span><small>导入一首本地音乐，它会出现在这里。</small></div>}
      </div>
    </section>
  );
}
