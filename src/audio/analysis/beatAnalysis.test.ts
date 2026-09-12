import { describe, expect, it } from 'vitest';
import { analyzeSamples } from './beatAnalysis';
describe('background beat analysis', () => {
  it('rejects silence and short material', () => {
    expect(analyzeSamples(new Float32Array(80000), 8000).grid).toBeUndefined();
    expect(analyzeSamples(new Float32Array(1000).fill(0.5), 8000).grid).toBeUndefined();
  });
  it('finds regular 120 BPM pulses and normalized overview peaks', () => {
    const samples = new Float32Array(8000 * 12);
    for (let i = 0; i < samples.length; i++) {
      const phase = (i / 8000 - 0.1 + 12) % 0.5;
      samples[i] = phase < 0.03 ? Math.sin(i * 0.14) * Math.exp(-phase * 90) * 0.8 : 0;
    }
    const result = analyzeSamples(samples, 8000);
    expect(result.grid?.bpm).toBeCloseTo(120, 0);
    expect(result.grid!.confidence).toBeGreaterThan(0.5);
    expect(result.grid!.firstBeat).toBeCloseTo(0.1, 1);
    expect(result.peaks).toHaveLength(768);
    expect(Math.max(...result.peaks)).toBeLessThanOrEqual(1);
  });
});
