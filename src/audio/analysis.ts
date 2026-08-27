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
