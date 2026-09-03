import { ListMusic, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { libraryRepository } from '../data/WebLibraryRepository';
import type { Playlist } from '../types/models';

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => { void libraryRepository.listPlaylists().then(setPlaylists); }, []);
  const create = async () => {
    const playlist = await libraryRepository.createPlaylist(`我的歌单 ${playlists.length + 1}`);
    setPlaylists([playlist, ...playlists]);
  };
  return <section className="page playlists-page"><header className="page-heading"><div><span>PLAYLISTS</span><h1>播放列表</h1><p>把想听的声音组织成属于你的序列。</p></div><button className="primary-action" type="button" onClick={() => void create()}><Plus />新建歌单</button></header><div className="playlist-wall">{playlists.map((playlist) => <article key={playlist.id}><span><ListMusic /></span><h3>{playlist.name}</h3><p>{playlist.trackIds.length} 首音乐</p></article>)}{!playlists.length && <div className="empty-library"><span><ListMusic /></span><h2>还没有播放列表</h2><p>创建一个歌单，随后可以从曲库加入歌曲。</p></div>}</div></section>;
}
