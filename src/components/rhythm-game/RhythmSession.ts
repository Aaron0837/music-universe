import type { BeatGrid } from '../../types/models';

export type GameMode = 'bpm' | 'drums' | 'harmony';
export interface RhythmNote { id: number; lane: number; time: number; hit: boolean }
export type Judgment = 'PERFECT' | 'GREAT' | 'MISS';

/** All note positions are source-audio seconds. Rate converts the judgment window to wall time. */
export class RhythmSession {
  notes: RhythmNote[] = [];
  score = 0;
  combo = 0;
  lastJudgment = 'READY';
  private nextStep = 0;
  private nextId = 0;
  private lastPosition = -1;
  private version = -1;
  constructor(readonly mode: GameMode) {}

  rebuild(position: number, grid: BeatGrid, version: number): void {
    this.notes.length = 0;
    this.nextStep = Math.ceil((position - grid.firstBeat) / (30 / grid.bpm)) + 2;
    this.lastPosition = position; this.version = version; this.combo = 0;
  }

  update(position: number, grid: BeatGrid, rate: number, version: number, duration: number): boolean {
    if (version !== this.version || position < this.lastPosition - 0.02 || position - this.lastPosition > 1) this.rebuild(position, grid, version);
    this.lastPosition = position;
    let changed = false;
    for (const note of this.notes) if (!note.hit && (position - note.time) / rate > 0.15) {
      note.hit = true; this.combo = 0; this.lastJudgment = 'MISS'; changed = true;
    }
    while (this.notes.length && this.notes[0].time < position - rate * 0.4) this.notes.shift();
    const halfBeat = 30 / grid.bpm;
    while (grid.firstBeat + this.nextStep * halfBeat <= Math.min(duration, position + 2.4 * rate)) {
      const step = this.nextStep++, time = grid.firstBeat + step * halfBeat;
      const add = (lane: number) => this.notes.push({ id: this.nextId++, lane, time, hit: false });
      if (this.mode === 'bpm') { if (step % 2 === 0) add(0); }
      else if (this.mode === 'harmony') { if (step % 4 === 0) { const lane = ((Math.floor(step / 4) % 2) + 2) % 2; add(lane); add(lane + 2); } }
      else add([0, 2, 1, 2, 0, 3, 1, 2][((step % 8) + 8) % 8]);
    }
    return changed;
  }

  hit(lane: number, position: number, rate: number, latencyMs = 0): Judgment {
    const adjusted = position - latencyMs / 1000 * rate;
    let closest: RhythmNote | undefined;
    for (const note of this.notes) if (!note.hit && note.lane === lane && (!closest || Math.abs(note.time - adjusted) < Math.abs(closest.time - adjusted))) closest = note;
    const distance = closest ? Math.abs(closest.time - adjusted) / rate : Infinity;
    if (!closest || distance > 0.15 + 1e-9) { this.combo = 0; return this.lastJudgment = 'MISS'; }
    closest.hit = true;
    const judgment = distance <= 0.08 + 1e-9 ? 'PERFECT' : 'GREAT';
    this.score += judgment === 'PERFECT' ? 1000 : 500; this.combo++;
    this.lastJudgment = judgment;
    return judgment;
  }
}
