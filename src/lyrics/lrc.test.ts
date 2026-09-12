import { describe, expect, it } from 'vitest';
import { activeLineIndex, formatStamp, lineProgress, lyricsTextFromCommon, parseLrc } from './lrc';

describe('parseLrc', () => {
  it('reads timed lines in order with minute, second and fractional parts', () => {
    const result = parseLrc('[00:12.30]first\n[01:05.500]second');
    expect(result.synced).toBe(true);
    expect(result.lines).toEqual([
      { time: 12.3, text: 'first' },
      { time: 65.5, text: 'second' },
    ]);
  });

  it('sorts out-of-order timestamps', () => {
    const result = parseLrc('[00:30]late\n[00:10]early');
    expect(result.lines.map((line) => line.text)).toEqual(['early', 'late']);
  });

  it('expands one line carrying several timestamps', () => {
    const result = parseLrc('[00:10][00:40]chorus');
    expect(result.lines).toEqual([
      { time: 10, text: 'chorus' },
      { time: 40, text: 'chorus' },
    ]);
  });

  it('applies the offset tag by shifting lines earlier', () => {
    const result = parseLrc('[offset:+1000]\n[00:10]shifted');
    expect(result.lines[0].time).toBeCloseTo(9, 5);
  });

  it('drops metadata tags and blank filler lines', () => {
    const result = parseLrc('[ti:Song]\n[ar:Artist]\n\n[00:05]hello');
    expect(result.lines).toEqual([{ time: 5, text: 'hello' }]);
  });

  it('keeps every line of a plain-text block and marks it unsynced', () => {
    const result = parseLrc('just words\nand more words');
    expect(result.synced).toBe(false);
    expect(result.lines.map((line) => line.text)).toEqual(['just words', 'and more words']);
  });

  it('drops untimed lines from an otherwise timed block', () => {
    const result = parseLrc('credits\n[00:05]real line');
    expect(result.synced).toBe(true);
    expect(result.lines).toEqual([{ time: 5, text: 'real line' }]);
  });

  it('accepts empty text for an instrumental gap', () => {
    const result = parseLrc('[00:01]a\n[00:08]\n[00:20]b');
    expect(result.lines).toHaveLength(3);
    expect(result.lines[1].text).toBe('');
  });

  it('returns an empty result for blank input', () => {
    expect(parseLrc('   \n  ')).toEqual({ lines: [], synced: false });
  });
});

describe('activeLineIndex', () => {
  const lines = [
    { time: 1, text: 'a' },
    { time: 5, text: 'b' },
    { time: 9, text: 'c' },
  ];
  it('is -1 before the first line', () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
  });
  it('returns the last line at or before the position', () => {
    expect(activeLineIndex(lines, 1)).toBe(0);
    expect(activeLineIndex(lines, 5)).toBe(1);
    expect(activeLineIndex(lines, 8.99)).toBe(1);
    expect(activeLineIndex(lines, 100)).toBe(2);
  });
  it('handles an empty list', () => {
    expect(activeLineIndex([], 5)).toBe(-1);
  });
});

describe('lineProgress', () => {
  const lines = [
    { time: 0, text: 'a' },
    { time: 4, text: 'b' },
  ];
  it('is zero for no active line', () => {
    expect(lineProgress(lines, -1, 2, 10)).toBe(0);
  });
  it('fills between the current and next line', () => {
    expect(lineProgress(lines, 0, 2, 10)).toBe(0.5);
  });
  it('uses track duration for the final line', () => {
    expect(lineProgress(lines, 1, 7, 10)).toBeCloseTo(0.5, 5);
  });
  it('clamps outside the range', () => {
    expect(lineProgress(lines, 0, 99, 10)).toBe(1);
    expect(lineProgress(lines, 0, -5, 10)).toBe(0);
  });
  it('treats a zero-length line as finished', () => {
    expect(lineProgress([{ time: 3, text: 'x' }, { time: 3, text: 'y' }], 0, 3, 10)).toBe(1);
  });
});

describe('lyricsTextFromCommon', () => {
  it('prefers unsynchronised text', () => {
    expect(lyricsTextFromCommon({ lyrics: [{ text: 'plain' }] })).toBe('plain');
  });
  it('accepts a bare string', () => {
    expect(lyricsTextFromCommon({ lyrics: '[00:01]raw' })).toBe('[00:01]raw');
  });
  it('converts SYLT-style syncText into LRC', () => {
    const text = lyricsTextFromCommon({ syncLyrics: [{ syncText: [{ text: 'one', timestamp: 1500 }, { text: 'two', timestamp: 3500 }] }] });
    expect(text).toBe('[00:01.50]one\n[00:03.50]two');
  });
  it('prefers syncText when there is no plain text', () => {
    const text = lyricsTextFromCommon({ lyrics: [{ syncText: [{ text: 'hi', timestamp: 2000 }] }] });
    expect(text).toBe('[00:02.00]hi');
  });
  it('returns undefined for absent or empty lyrics', () => {
    expect(lyricsTextFromCommon({})).toBeUndefined();
    expect(lyricsTextFromCommon({ lyrics: [] })).toBeUndefined();
    expect(lyricsTextFromCommon({ lyrics: [{ text: '   ' }] })).toBeUndefined();
  });
});

describe('formatStamp', () => {
  it('pads minutes and seconds', () => {
    expect(formatStamp(1.5)).toBe('00:01.50');
    expect(formatStamp(125.25)).toBe('02:05.25');
  });
  it('clamps invalid and negative input', () => {
    expect(formatStamp(-3)).toBe('00:00.00');
    expect(formatStamp(Number.NaN)).toBe('00:00.00');
  });
});
