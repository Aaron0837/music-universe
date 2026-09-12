import { Disc3, Grid2X2, Heart, List, Play, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { libraryRepository } from '../data/WebLibraryRepository';
import { useMusicActions } from '../hooks/useMusicActions';
import { useAppStore } from '../stores/useAppStore';
import type { DeckId } from '../types/models';
import { Artwork } from '../components/ui/Artwork';
import { ImportButton } from '../components/library/ImportButton';

export function LibraryPage() {
  const tracks = useAppStore((state) => state.tracks);
  const search = useAppStore((state) => state.search);
  const favorites = useAppStore((state) => state.favorites);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setTracks = useAppStore((state) => state.setTracks);
  const notify = useAppStore((state) => state.notify);
  const { loadTrack } = useMusicActions();
  const [grid, setGrid] = useState(false);
  const [sort, setSort] = useState<'added' | 'title' | 'artist' | 'bpm'>('added');
  const [artist, setArtist] = useState('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const artists = useMemo(() => [...new Set(tracks.map((track) => track.artist))].sort(), [tracks]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return tracks.filter((track) => (artist === 'all' || track.artist === artist) && (!onlyFavorites || favorites.includes(track.id)) && (!needle || `${track.title} ${track.artist} ${track.album} ${track.genres?.join(' ') ?? ''}`.toLocaleLowerCase().includes(needle))).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'artist' ? a.artist.localeCompare(b.artist) : sort === 'bpm' ? (b.bpm ?? 0) - (a.bpm ?? 0) : b.addedAt - a.addedAt);
  }, [artist, onlyFavorites, favorites, search, sort, tracks]);
  const dropOnDeck = (event: React.DragEvent, deck: DeckId) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-music-track');
    if (id) void loadTrack(id, deck, false);
  };
  const remove = async (id: string) => {
    await libraryRepository.removeTrack(id);
    setTracks(await libraryRepository.listTracks());
    notify('已从本地曲库移除');
  };
  return (
    <section className="page library-page">
      <header className="page-heading"><div><span>LOCAL COLLECTION</span><h1>你的音乐</h1><p>{tracks.length} 首音乐 · 只保存在这台设备</p></div><ImportButton /></header>
      <div className="library-tools"><label><Search size={17} /><input placeholder="在曲库内搜索" value={search} onChange={(event) => useAppStore.getState().setSearch(event.target.value)} /></label><select aria-label="按艺术家筛选" value={artist} onChange={(event) => setArtist(event.target.value)}><option value="all">全部艺术家</option>{artists.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="曲库排序" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="added">最近加入</option><option value="title">按标题</option><option value="artist">按艺术家</option><option value="bpm">按 BPM</option></select><button className={onlyFavorites ? 'active' : ''} type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}><Heart size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />只看喜欢</button><span /><button className={!grid ? 'active' : ''} type="button" aria-label="列表视图" onClick={() => setGrid(false)}><List /></button><button className={grid ? 'active' : ''} type="button" aria-label="网格视图" onClick={() => setGrid(true)}><Grid2X2 /></button></div>
      <div className="deck-drop-row"><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnDeck(event, 'A')}><b>A</b><span>拖到这里载入 Deck A</span></div><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnDeck(event, 'B')}><b>B</b><span>拖到这里载入 Deck B</span></div></div>
      {filtered.length ? <div className={grid ? 'track-grid' : 'track-table'}>
        {!grid && <div className="track-table-head"><span>#</span><span>标题</span><span>专辑</span><span>BPM</span><span>操作</span></div>}
        {filtered.map((track, index) => <article draggable onDragStart={(event) => event.dataTransfer.setData('application/x-music-track', track.id)} key={track.id}>
          <span className="track-index">{String(index + 1).padStart(2, '0')}</span><Artwork artwork={track.artwork} /><div className="track-title"><strong>{track.title}</strong><small>{track.artist}</small></div><span className="track-album">{track.album}</span><span className="track-bpm">{track.bpm ? Math.round(track.bpm) : '—'}</span><div className="track-actions"><button className={favorites.includes(track.id) ? 'liked' : ''} type="button" aria-label={favorites.includes(track.id) ? `取消喜欢 ${track.title}` : `喜欢 ${track.title}`} aria-pressed={favorites.includes(track.id)} onClick={() => toggleFavorite(track.id)}><Heart size={13} fill={favorites.includes(track.id) ? 'currentColor' : 'none'} /></button><button type="button" aria-label="播放" onClick={() => void loadTrack(track.id)}><Play /></button><button type="button" onClick={() => void loadTrack(track.id, 'A', false)}>A</button><button type="button" onClick={() => void loadTrack(track.id, 'B', false)}>B</button><button type="button" aria-label="移除" onClick={() => void remove(track.id)}>×</button></div>
        </article>)}
      </div> : <div className="empty-library"><span><Disc3 /></span><h2>等待你的第一首音乐</h2><p>支持 MP3、FLAC、WAV、M4A 与 OGG。导入后可以离线播放，也能拖入 DJ Deck。</p><ImportButton /></div>}
    </section>
  );
}
