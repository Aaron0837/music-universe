export function equalPowerGains(position: number): [number, number] {
  const normalized = Math.max(0, Math.min(1, (position + 1) / 2));
  return [Math.cos(normalized * Math.PI / 2), Math.sin(normalized * Math.PI / 2)];
}

export function dbToGain(db: number): number {
  return Math.pow(10, Math.max(-60, Math.min(12, db)) / 20);
}

export function clampTempo(bpm: number): number {
  return Math.max(60, Math.min(200, Math.round(bpm * 10) / 10));
}
