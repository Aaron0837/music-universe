import { describe, expect, it } from 'vitest';
import { TransportClock, wrapPosition } from './TransportClock';
import { syncPosition } from './syncMath';
const grid = { bpm: 120, firstBeat: 0, confidence: 1, source: 'manual' as const, version: 1 };
describe('transport clock', () => {
  const clock = () => { const c = new TransportClock(); c.duration = 32; c.playing = true; return c; };
  it('integrates a smooth tempo ramp without a position jump', () => {
    const c = clock(); c.setSpeed(2, 5, 0.1);
    expect(c.position(5)).toBe(5);
    expect(c.position(5.05)).toBeCloseTo(5.0625);
    expect(c.position(6)).toBeCloseTo(6.95);
  });
  it('integrates repeated changes from the current rate', () => {
    const c = clock(); c.setSpeed(2, 1, 1); c.setSpeed(1, 1.5, 0.5);
    expect(c.position(1.5)).toBeCloseTo(1.625);
    expect(c.position(2)).toBeCloseTo(2.25);
  });
  it('freezes paused time and anchors seeking', () => {
    const c = clock(); const at = c.position(4); c.playing = false; c.anchor(at, 4);
    expect(c.position(100)).toBe(4); c.anchor(10, 100); c.playing = true;
    expect(c.position(101)).toBe(11);
  });
  it('accounts for octave transposition and reverse boundaries', () => {
    const c = clock(); c.setSpeed(Math.pow(2, 12 / 12), 0, 0);
    expect(c.position(2)).toBe(4); c.anchor(4, 2); c.reverse = true;
    expect(c.position(3)).toBe(2); expect(c.position(10)).toBe(0);
  });
  it.each([1, 2, 4, 8])('wraps a %i beat loop in both directions', (beats) => {
    const c = clock(); c.loop = { start: 2, end: 2 + beats * 0.5 }; c.anchor(2, 0);
    expect(c.position(beats * 0.5 + 0.1)).toBeCloseTo(2.1);
    c.reverse = true; expect(c.position(0.1)).toBeCloseTo(c.loop.end - 0.1);
  });
  it('handles exact loop boundaries', () => {
    expect(wrapPosition(4, 2, 4)).toBe(2);
    expect(wrapPosition(-1, 2, 4)).toBe(3);
  });
});
describe('phase sync', () => {
  it('maps phase across different original BPM and first beats', () => {
    const target = { ...grid, bpm: 100, firstBeat: 0.2 };
    const position = syncPosition(2.25, grid, 3, target);
    expect(position).toBeCloseTo(2.9);
    expect(((position - 0.2) / 0.6) % 1).toBeCloseTo(0.5);
  });
  it('never produces negative positions', () => {
    expect(syncPosition(0, grid, 0, { ...grid, firstBeat: 0.3 })).toBeGreaterThanOrEqual(0);
  });
});
