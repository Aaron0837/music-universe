import { describe, expect, it } from 'vitest';
import { addTrackToPlaylist, moveTrack, nextIndex, pruneMissing, removeTrackFromPlaylist } from './playlistMath';

describe('addTrackToPlaylist', () => {
  it('appends new tracks and keeps order', () => {
    expect(addTrackToPlaylist(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });
  it('does not duplicate an existing track', () => {
    expect(addTrackToPlaylist(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });
  it('ignores an empty id', () => {
    expect(addTrackToPlaylist(['a'], '')).toEqual(['a']);
  });
});

describe('removeTrackFromPlaylist', () => {
  it('removes every occurrence without touching the rest', () => {
    expect(removeTrackFromPlaylist(['a', 'b', 'a', 'c'], 'a')).toEqual(['b', 'c']);
  });
});

describe('moveTrack', () => {
  it('moves an entry forward', () => {
    expect(moveTrack(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an entry backward', () => {
    expect(moveTrack(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('clamps a target past the end', () => {
    expect(moveTrack(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
  });
  it('clamps a negative target to the front', () => {
    expect(moveTrack(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });
  it('returns an equal copy for a no-op or bad source', () => {
    expect(moveTrack(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveTrack(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('nextIndex', () => {
  it('advances until the end then stops', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBeUndefined();
    expect(nextIndex(0, 1)).toBeUndefined();
  });
});

describe('pruneMissing', () => {
  it('drops ids the library no longer has', () => {
    expect(pruneMissing(['a', 'gone', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
