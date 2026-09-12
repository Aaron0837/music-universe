import { ArrowDown, ArrowUp, ListMusic, Play, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryRepository } from '../data/WebLibraryRepository';
import { addTrackToPlaylist, moveTrack, removeTrackFromPlaylist } from '../playlists/playlistMath';
import { startQueue } from '../playlists/queue';
import { useAppStore } from '../stores/useAppStore';
import type { Playlist } from '../types/models';

export function PlaylistsPage() {
  const tracks = useAppStore((state) => state.tracks);
  const notify = useAppStore((state) => state.notify);
  const queue = useAppStore((state) => state.queue);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draftName, setDraftName] = useState('');
  // Stays open while the user adds several tracks in a row.
  const [pickerOpen, setPickerOpen] = useState(true);

  useEffect(() => {
    void libraryRepository.listPlaylists().then((list) => {
      setPlaylists(list);
      setSelectedId((current) => current ?? list[0]?.id);
    });
  }, []);

  const selected = playlists.find((playlist) => playlist.id === selectedId);
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);

  const persist = useCallback(async (playlist: Playlist) => {
    await libraryRepository.savePlaylist(playlist);
    setPlaylists((current) => current.map((item) => (item.id === playlist.id ? playlist : item)));
  }, []);

  const create = async () => {
    const playlist = await libraryRepository.createPlaylist(draftName || `我的歌单 ${playlists.length + 1}`);
    setPlaylists([playlist, ...playlists]);
    setSelectedId(playlist.id);
    setDraftName('');
    notify('已创建歌单，可从曲库加入音乐');
  };

  const remove = async (playlist: Playlist) => {
    await libraryRepository.removePlaylist(playlist.id);
    const next = playlists.filter((item) => item.id !== playlist.id);
    setPlaylists(next);
    if (selectedId === playlist.id) setSelectedId(next[0]?.id);
    notify(`已删除歌单「${playlist.name}」`);
  };

  const rename = async (playlist: Playlist, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === playlist.name) return;
    await persist({ ...playlist, name: trimmed });
  };

  const add = async (playlist: Playlist, trackId: string) => {
    const next = addTrackToPlaylist(playlist.trackIds, trackId);
    if (next.length === playlist.trackIds.length) return notify('这首歌已在歌单中');
    await persist({ ...playlist, trackIds: next });
  };

  const drop = async (playlist: Playlist, trackId: string) => {
    await persist({ ...playlist, trackIds: removeTrackFromPlaylist(playlist.trackIds, trackId) });
  };

  const move = async (playlist: Playlist, from: number, to: number) => {
    await persist({ ...playlist, trackIds: moveTrack(playlist.trackIds, from, to) });
  };

  const available = selected ? tracks.filter((track) => !selected.trackIds.includes(track.id)) : tracks;

  return (
    <section className="page playlists-page">
      <header className="page-heading">
        <div><span>PLAYLISTS</span><h1>播放列表</h1><p>把想听的声音组织成属于你的序列，按顺序连续播放。</p></div>
        <div className="playlist-create">
          <input aria-label="新歌单名称" placeholder="新歌单名称（可留空）" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          <button className="primary-action" type="button" onClick={() => void create()}><Plus />新建歌单</button>
        </div>
      </header>

      {playlists.length ? (
        <div className="playlist-layout">
          <div className="playlist-wall">
            {playlists.map((playlist) => (
              <article key={playlist.id} className={playlist.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(playlist.id)}>
                <span><ListMusic /></span>
                <h3>{playlist.name}</h3>
                <p>{playlist.trackIds.length} 首音乐</p>
                <div className="playlist-actions">
                  <button type="button" className="playlist-play" aria-label={`播放歌单 ${playlist.name}`} onClick={(event) => { event.stopPropagation(); void startQueue(playlist, 'A'); }}><Play /></button>
                  <button type="button" aria-label={`删除歌单 ${playlist.name}`} onClick={(event) => { event.stopPropagation(); void remove(playlist); }}><Trash2 /></button>
                </div>
              </article>
            ))}
          </div>

          {selected && (
            <div className="playlist-detail">
              <header>
                <input aria-label="歌单名称" defaultValue={selected.name} key={selected.id} onBlur={(event) => void rename(selected, event.target.value)} />
                <button className="primary-action" type="button" onClick={() => void startQueue(selected, 'A')}><Play />从 Deck A 播放</button>
              </header>

              {selected.trackIds.length ? (
                <ol className="playlist-tracks">
                  {selected.trackIds.map((trackId, index) => {
                    const track = byId.get(trackId);
                    const playing = queue?.deck === 'A' && queue.trackIds[queue.index] === trackId;
                    return (
                      <li key={`${trackId}-${index}`} className={playing ? 'playing' : ''}>
                        <span className="playlist-index">{String(index + 1).padStart(2, '0')}</span>
                        <div><strong>{track?.title ?? '（已从曲库移除）'}</strong><small>{track?.artist ?? '—'}</small></div>
                        <div className="playlist-row-actions">
                          <button type="button" aria-label={`上移 ${track?.title ?? ''}`} disabled={index === 0} onClick={() => void move(selected, index, index - 1)}><ArrowUp /></button>
                          <button type="button" aria-label={`下移 ${track?.title ?? ''}`} disabled={index === selected.trackIds.length - 1} onClick={() => void move(selected, index, index + 1)}><ArrowDown /></button>
                          <button type="button" aria-label={`从歌单移除 ${track?.title ?? ''}`} onClick={() => void drop(selected, trackId)}><X /></button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : <div className="empty-library"><span><ListMusic /></span><h2>这个歌单还是空的</h2><p>从下方曲库挑一首加入，或新建一个歌单。</p></div>}

              <details className="playlist-picker" key={selected.id} open={pickerOpen} onToggle={(event) => setPickerOpen((event.target as HTMLDetailsElement).open)}>
                <summary>从曲库加入音乐（{available.length} 首可选）</summary>
                {available.length ? <ul>
                  {available.map((track) => (
                    <li key={track.id}><div><strong>{track.title}</strong><small>{track.artist}</small></div><button type="button" aria-label={`加入 ${track.title}`} onClick={() => void add(selected, track.id)}><Plus /></button></li>
                  ))}
                </ul> : <p className="playlist-note">曲库里的音乐都已在这个歌单中。</p>}
              </details>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-library"><span><ListMusic /></span><h2>还没有播放列表</h2><p>创建一个歌单，随后可以从曲库加入歌曲。</p></div>
      )}
    </section>
  );
}
