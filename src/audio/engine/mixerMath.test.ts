import { describe, expect, it } from 'vitest';
import { clampTempo, dbToGain, equalPowerGains } from './mixerMath';

describe('mixer math', () => {
  it('uses an equal-power crossfade', () => {
    expect(equalPowerGains(-1)).toEqual([1, 0]);
    expect(equalPowerGains(1)[0]).toBeCloseTo(0, 5);
    expect(equalPowerGains(0)[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(equalPowerGains(0)[1]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('converts decibels and clamps tempo', () => {
    expect(dbToGain(0)).toBe(1);
    expect(clampTempo(10)).toBe(60);
    expect(clampTempo(245)).toBe(200);
  });
});
