import { describe, expect, it } from 'vitest';
import { RhythmSession } from './RhythmSession';
const grid = { bpm: 120, firstBeat: 0, confidence: 1, source: 'demo' as const, version: 1 };
describe('music-clock rhythm session', () => {
  it.each([[0.08, 'PERFECT'], [0.15, 'GREAT'], [0.151, 'MISS']] as const)('judges %f seconds as %s', (offset, judgment) => {
    const game = new RhythmSession('bpm'); game.update(0, grid, 1, 0, 30);
    expect(game.hit(0, 0.5 + offset, 1)).toBe(judgment);
  });
  it('scales the window with tempo and compensates output latency', () => {
    const game = new RhythmSession('bpm'); game.update(0, grid, 2, 0, 30);
    expect(game.hit(0, 0.5 + 0.16 + 0.2, 2, 100)).toBe('PERFECT');
  });
  it('does not award the same note twice', () => {
    const game = new RhythmSession('bpm'); game.update(0, grid, 1, 0, 30);
    expect(game.hit(0, 0.5, 1)).toBe('PERFECT'); game.hit(0, 0.5, 1);
    expect(game.score).toBe(1000); expect(game.combo).toBe(0);
  });
  it('breaks combo for missed notes', () => {
    const game = new RhythmSession('bpm'); game.update(0, grid, 1, 0, 30);
    game.hit(0, 0.5, 1); game.update(0.7, grid, 1, 0, 30); game.update(1.2, grid, 1, 0, 30);
    expect(game.combo).toBe(0); expect(game.lastJudgment).toBe('MISS');
  });
  it('rebuilds after seeking or looping, without stale notes', () => {
    const game = new RhythmSession('drums'); game.update(0, grid, 1, 0, 30);
    game.update(10, grid, 1, 1, 30);
    expect(game.notes.every((note) => note.time > 10)).toBe(true);
    game.update(2, grid, 1, 1, 30);
    expect(game.notes.every((note) => note.time > 2 && note.time < 5)).toBe(true);
  });
  it('offers three distinct patterns including simultaneous harmony notes', () => {
    const bpm = new RhythmSession('bpm'), drums = new RhythmSession('drums'), harmony = new RhythmSession('harmony');
    for (const game of [bpm, drums, harmony]) game.update(0, grid, 1, 0, 30);
    expect(bpm.notes.every((note) => note.lane === 0)).toBe(true);
    expect(new Set(drums.notes.map((note) => note.lane)).size).toBe(4);
    expect(harmony.notes[0].time).toBe(harmony.notes[1].time);
    harmony.hit(harmony.notes[0].lane, harmony.notes[0].time, 1);
    harmony.hit(harmony.notes[1].lane, harmony.notes[1].time, 1);
    expect(harmony.combo).toBe(2);
  });
  it('never generates notes beyond the track end', () => {
    const game = new RhythmSession('drums'); game.update(0, grid, 1, 0, 1);
    expect(game.notes.every((note) => note.time <= 1)).toBe(true);
  });
});
