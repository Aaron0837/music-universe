import { describe, expect, it } from 'vitest';
import { averageBand, calculateRms, detectTransient, estimateSourceBpm, normalizeBpm, smooth, tempoRate } from './audioMath';

describe('audio analysis', () => {
  it('normalizes frequency bands to zero through one', () => {
    expect(averageBand(new Uint8Array([0, 255, 255, 0]), 0.25, 0.75)).toBe(1);
    expect(averageBand(new Uint8Array(8), 0, 1)).toBe(0);
  });
  it('calculates centered waveform RMS', () => {
    expect(calculateRms(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(calculateRms(new Uint8Array([0, 255]))).toBeGreaterThan(.9);
  });
  it('uses faster attack than release', () => {
    expect(smooth(0, 1)).toBeCloseTo(.38);
    expect(smooth(1, 0)).toBeCloseTo(.9);
  });
  it('only emits a transient above the moving baseline', () => {
    expect(detectTransient(.2, .2)).toBe(0);
    expect(detectTransient(.6, .2)).toBeGreaterThan(.9);
  });
  it('normalizes tempo estimates and compensates for playback rate', () => {
    expect(normalizeBpm(240)).toBe(120);
    expect(estimateSourceBpm([468, 470, 469, 471], 1)).toBeCloseTo(128, 0);
    expect(estimateSourceBpm([390, 391, 389, 390], 1.25)).toBeCloseTo(123, 0);
  });
  it('clamps tempo playback to a safe browser range', () => {
    expect(tempoRate(180, 120)).toBe(1.5);
    expect(tempoRate(80, 160)).toBe(.65);
  });
});
