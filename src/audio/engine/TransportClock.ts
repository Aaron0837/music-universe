export function wrapPosition(position: number, start: number, end: number): number {
  const length = end - start;
  return length > 0 ? start + ((position - start) % length + length) % length : start;
}

/** Integrates the same linear speed ramp scheduled on AudioParam. Units are source seconds. */
export class TransportClock {
  private origin = 0;
  private at = 0;
  private from = 1;
  private to = 1;
  private ramp = 0;
  playing = false;
  reverse = false;
  duration = 0;
  loop?: { start: number; end: number };

  raw(now: number): number {
    if (!this.playing) return this.origin;
    const elapsed = Math.max(0, now - this.at);
    const during = Math.min(elapsed, this.ramp);
    const integral = this.ramp > 0
      ? this.from * during + (this.to - this.from) * during * during / (2 * this.ramp) + Math.max(0, elapsed - this.ramp) * this.to
      : elapsed * this.to;
    return this.origin + integral * (this.reverse ? -1 : 1);
  }

  position(now: number): number {
    const position = this.raw(now);
    return this.loop ? wrapPosition(position, this.loop.start, this.loop.end) : Math.max(0, Math.min(this.duration, position));
  }

  speed(now: number): number {
    return this.ramp > 0 ? this.from + (this.to - this.from) * Math.min(1, Math.max(0, now - this.at) / this.ramp) : this.to;
  }

  anchor(position: number, now: number): void { this.origin = position; this.at = now; }

  setSpeed(speed: number, now: number, ramp = 0.025): number {
    const current = this.speed(now);
    const position = this.position(now);
    this.anchor(position, now);
    this.from = current; this.to = speed; this.ramp = ramp;
    return current;
  }
}
