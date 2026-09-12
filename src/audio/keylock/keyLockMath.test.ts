import { describe, expect, it } from 'vitest';
import { audibleBpm, resolveRates, tempoForAudible } from './keyLockMath';

describe('resolveRates', () => {
  it('lets tempo and Harmony both drive rate when key lock is off', () => {
    const rates = resolveRates({ keyLock: false, bpm: 150, sourceBpm: 120, keyShift: 12 });
    expect(rates.clockRate).toBeCloseTo(2.5, 10);
    expect(rates.workletPitch).toBe(1);
  });

  it('keeps rate at tempo and moves pitch to Harmony when key lock is on', () => {
    const rates = resolveRates({ keyLock: true, bpm: 150, sourceBpm: 120, keyShift: 12 });
    expect(rates.clockRate).toBeCloseTo(1.25, 10);
    expect(rates.workletRate).toBeCloseTo(1.25, 10);
    expect(rates.workletPitch).toBeCloseTo(2, 10);
  });

  it('mirrors the source rate on the worklet even at neutral Harmony', () => {
    const rates = resolveRates({ keyLock: true, bpm: 90, sourceBpm: 120, keyShift: 0 });
    expect(rates.workletRate).toBeCloseTo(0.75, 10);
    expect(rates.workletPitch).toBeCloseTo(1, 10);
  });

  it('holds pitch steady while tempo changes with key lock on', () => {
    const slow = resolveRates({ keyLock: true, bpm: 100, sourceBpm: 120, keyShift: 5 });
    const fast = resolveRates({ keyLock: true, bpm: 170, sourceBpm: 120, keyShift: 5 });
    expect(slow.workletPitch).toBeCloseTo(fast.workletPitch, 10);
    expect(fast.clockRate).toBeGreaterThan(slow.clockRate);
  });
});

describe('audibleBpm', () => {
  it('folds Harmony into the beat rate only without key lock', () => {
    expect(audibleBpm({ keyLock: false, bpm: 120, keyShift: 12 })).toBeCloseTo(240, 10);
    expect(audibleBpm({ keyLock: true, bpm: 120, keyShift: 12 })).toBeCloseTo(120, 10);
  });
});

describe('tempoForAudible', () => {
  it('round-trips through audibleBpm for both modes', () => {
    for (const keyLock of [true, false]) {
      for (const keyShift of [-7, 0, 3, 12]) {
        const tempo = tempoForAudible(140, keyLock, keyShift);
        expect(audibleBpm({ keyLock, bpm: tempo, keyShift })).toBeCloseTo(140, 10);
      }
    }
  });
});
