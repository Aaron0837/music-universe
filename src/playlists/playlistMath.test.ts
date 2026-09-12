import { describe, expect, it } from 'vitest';
import { addTrackToPlaylist, moveTrack, nextIndex, nextPlayMode, nextQueueIndex, nextShuffleIndex, orderPosition, pruneMissing, removeTrackFromPlaylist, shuffledOrder } from './playlistMath';

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

describe('nextQueueIndex', () => {
  it('keeps the historical stop-at-the-end default', () => {
    expect(nextQueueIndex(0, 3)).toBe(1);
    expect(nextQueueIndex(2, 3)).toBeUndefined();
    expect(nextQueueIndex(0, 1)).toBeUndefined();
  });

  it('wraps to the front in repeat-all', () => {
    expect(nextQueueIndex(0, 3, 'repeat-all')).toBe(1);
    expect(nextQueueIndex(2, 3, 'repeat-all')).toBe(0);
    expect(nextQueueIndex(0, 1, 'repeat-all')).toBe(0);
  });

  it('holds the same entry in repeat-one', () => {
    expect(nextQueueIndex(1, 3, 'repeat-one')).toBe(1);
    expect(nextQueueIndex(2, 3, 'repeat-one')).toBe(2);
  });

  it('returns undefined for an empty queue in every mode', () => {
    expect(nextQueueIndex(0, 0)).toBeUndefined();
    expect(nextQueueIndex(0, 0, 'repeat-all')).toBeUndefined();
    expect(nextQueueIndex(0, 0, 'repeat-one')).toBeUndefined();
  });
});

describe('shuffledOrder', () => {
  it('is a permutation of every index exactly once', () => {
    const order = shuffledOrder(8, () => 0.42);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles the empty and single-entry cases', () => {
    expect(shuffledOrder(0)).toEqual([]);
    expect(shuffledOrder(1)).toEqual([0]);
  });

  it('does not fall off the end when the random source returns exactly 1', () => {
    const order = shuffledOrder(5, () => 1);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('orderPosition', () => {
  it('finds an entry and reports misses as -1', () => {
    expect(orderPosition([2, 0, 1], 0)).toBe(1);
    expect(orderPosition([2, 0, 1], 9)).toBe(-1);
  });
});

describe('nextShuffleIndex', () => {
  it('walks the existing order without reshuffling', () => {
    const result = nextShuffleIndex([2, 0, 1], 2, 3, () => 0.5);
    expect(result.index).toBe(0);
    expect(result.order).toEqual([2, 0, 1]);
  });

  it('rebuilds the order once it has been exhausted', () => {
    const result = nextShuffleIndex([2, 0, 1], 1, 3, () => 0.5);
    expect(result.order).toHaveLength(3);
    expect([...result.order].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('never opens a fresh order with the track that just finished', () => {
    // A random source of 0 would otherwise shuffle 0 to the front every time.
    const result = nextShuffleIndex([2, 0, 1], 1, 3, () => 0);
    expect(result.index).not.toBe(1);
  });

  it('plays every track once before repeating any', () => {
    let order: number[] = [];
    let index = 0;
    const seen: number[] = [];
    for (let step = 0; step < 6; step++) {
      const result = nextShuffleIndex(order, index, 4, () => 0.37);
      index = result.index;
      order = result.order;
      seen.push(index);
    }
    // The first four steps must cover all four positions.
    expect(new Set(seen.slice(0, 4)).size).toBe(4);
  });

  it('handles an empty queue and a stale index', () => {
    expect(nextShuffleIndex([], 0, 0).index).toBe(0);
    const stale = nextShuffleIndex([1, 2], 0, 3, () => 0.5);
    expect(stale.order).toHaveLength(3);
  });
});

describe('nextPlayMode', () => {
  it('cycles through every mode and back to the start', () => {
    expect(nextPlayMode('sequential')).toBe('repeat-all');
    expect(nextPlayMode('repeat-all')).toBe('repeat-one');
    expect(nextPlayMode('repeat-one')).toBe('shuffle');
    expect(nextPlayMode('shuffle')).toBe('sequential');
  });
});
