export function averageBand(bins: Uint8Array, from: number, to: number): number {
  const start = Math.max(0, Math.floor(from * bins.length));
  const end = Math.min(bins.length, Math.max(start + 1, Math.floor(to * bins.length)));
  let sum = 0;
  for (let i = start; i < end; i++) sum += bins[i];
  return Math.min(1, sum / (end - start) / 255);
}

export function calculateRms(samples: Uint8Array): number {
  let squares = 0;
  for (const value of samples) {
    const centered = (value - 128) / 128;
    squares += centered * centered;
  }
  return Math.min(1, Math.sqrt(squares / samples.length) * 1.8);
}

export function smooth(previous: number, next: number, attack = 0.38, release = 0.1): number {
  return previous + (next - previous) * (next > previous ? attack : release);
}

export function detectTransient(energy: number, movingAverage: number): number {
  return Math.max(0, Math.min(1, (energy - movingAverage - 0.035) * 7));
}

export function normalizeBpm(value: number, minimum = 70, maximum = 180): number {
  if (!Number.isFinite(value) || value <= 0) return 120;
  let bpm = value;
  while (bpm < minimum) bpm *= 2;
  while (bpm > maximum) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

export function estimateSourceBpm(intervalsMs: readonly number[], playbackRate = 1): number | undefined {
  const usable = intervalsMs.filter((value) => Number.isFinite(value) && value >= 250 && value <= 2000);
  if (usable.length < 3) return undefined;
  const sorted = [...usable].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return normalizeBpm((60000 / median) / Math.max(0.01, playbackRate));
}

export function tempoRate(targetBpm: number, sourceBpm: number): number {
  return Math.max(0.65, Math.min(1.5, targetBpm / Math.max(1, sourceBpm)));
}
