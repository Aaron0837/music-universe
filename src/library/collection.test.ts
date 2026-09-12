import { describe, expect, it } from 'vitest';
import { addRecent, formatRemaining, isFavorite, pruneCollection, RECENT_LIMIT, sleepRemaining, toggleFavorite } from './collection';

describe('toggleFavorite', () => {
  it('adds a track that is not yet a favourite', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['a', 'b']);
  });
  it('removes a track that already is one', () => {
    expect(toggleFavorite(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('ignores an empty id', () => {
    expect(toggleFavorite(['a'], '')).toEqual(['a']);
  });
  it('does not mutate the input', () => {
    const input = ['a'];
    toggleFavorite(input, 'b');
    expect(input).toEqual(['a']);
  });
});

describe('isFavorite', () => {
  it('reports membership', () => {
    expect(isFavorite(['a'], 'a')).toBe(true);
    expect(isFavorite(['a'], 'b')).toBe(false);
  });
  it('treats a missing id as not a favourite', () => {
    expect(isFavorite(['a'], undefined)).toBe(false);
  });
});

describe('addRecent', () => {
  it('puts the newest play first', () => {
    expect(addRecent(['a'], 'b')).toEqual(['b', 'a']);
  });
  it('moves a replay to the front instead of duplicating it', () => {
    expect(addRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });
  it('caps the history at the limit', () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, index) => `t${index}`);
    const next = addRecent(full, 'new');
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`t${RECENT_LIMIT - 1}`);
  });
  it('ignores an empty id and the built-in demo', () => {
    expect(addRecent(['a'], '')).toEqual(['a']);
    expect(addRecent(['a'], 'demo')).toEqual(['a']);
  });
  it('accepts an explicit limit', () => {
    expect(addRecent(['a', 'b'], 'c', 2)).toEqual(['c', 'a']);
  });
});

describe('pruneCollection', () => {
  it('drops entries the library no longer has', () => {
    expect(pruneCollection(['a', 'gone'], ['b', 'gone'], ['a', 'b'])).toEqual({ favorites: ['a'], recent: ['b'] });
  });
  it('leaves both lists alone when everything exists', () => {
    expect(pruneCollection(['a'], ['b'], ['a', 'b'])).toEqual({ favorites: ['a'], recent: ['b'] });
  });
});

describe('sleepRemaining', () => {
  it('counts down to the end time', () => {
    expect(sleepRemaining(1000, 400)).toBe(600);
  });
  it('stops at zero rather than going negative', () => {
    expect(sleepRemaining(1000, 5000)).toBe(0);
  });
  it('is zero when no timer is set', () => {
    expect(sleepRemaining(undefined, 5000)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('renders minutes and padded seconds', () => {
    expect(formatRemaining(37 * 60 * 1000)).toBe('37:00');
    expect(formatRemaining(95 * 1000)).toBe('1:35');
  });
  it('floors negative input at zero', () => {
    expect(formatRemaining(-5000)).toBe('0:00');
  });
});
