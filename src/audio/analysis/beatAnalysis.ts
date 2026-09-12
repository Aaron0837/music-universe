import type { BeatGrid } from '../../types/models';

export interface TrackAnalysis { grid?: BeatGrid; peaks: Float32Array<ArrayBuffer> }

/** Onset-envelope autocorrelation. Confidence stays conservative for non-percussive music. */
export function analyzeSamples(samples: Float32Array, sampleRate: number): TrackAnalysis {
  const peaks = new Float32Array(768);
  const window = Math.max(1, Math.floor(samples.length / peaks.length));
  for (let i = 0; i < samples.length; i++) {
    const bin = Math.min(peaks.length - 1, Math.floor(i / window));
    peaks[bin] = Math.max(peaks[bin], Math.abs(samples[i]));
  }
  const hop = Math.max(1, Math.floor(sampleRate / 200));
  const count = Math.floor(Math.min(samples.length, sampleRate * 120) / hop);
  if (count < 800) return { peaks };
  const envelope = new Float32Array(count);
  let previous = 0, maxEnergy = 0, first = 0;
  for (let i = 0; i < count; i++) {
    let power = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) power += samples[j] * samples[j];
    const rms = Math.sqrt(power / hop);
    envelope[i] = Math.max(0, rms - previous * 0.85);
    if (envelope[i] > maxEnergy) { maxEnergy = envelope[i]; first = i; }
    previous = rms;
  }
  if (maxEnergy < 0.003) return { peaks };
  const hz = sampleRate / hop;
  let bestLag = 0, best = 0, runnerUp = 0;
  for (let lag = Math.floor(hz * 60 / 200); lag <= Math.ceil(hz); lag++) {
    let dot = 0, a = 0, b = 0;
    for (let i = lag; i < count; i++) {
      dot += envelope[i] * envelope[i - lag];
      a += envelope[i] ** 2; b += envelope[i - lag] ** 2;
    }
    const score = dot / Math.max(1e-9, Math.sqrt(a * b));
    if (score > best) { runnerUp = best; best = score; bestLag = lag; }
  }
  if (!bestLag) return { peaks };
  // Select the earliest strong onset in the winning phase, rather than an arbitrary peak.
  const phase = first % bestLag;
  for (let i = phase; i < count; i += bestLag) {
    if (envelope[i] > maxEnergy * 0.35) { first = i; break; }
  }
  const bpm = Math.max(60, Math.min(200, Math.round(60 * hz / bestLag * 10) / 10));
  return { peaks, grid: { bpm, firstBeat: first / hz, confidence: Math.min(0.95, best * 0.9 + Math.max(0, best - runnerUp) * 0.1), source: 'analysis', version: 1 } };
}
