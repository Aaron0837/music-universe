/**
 * Rate resolution for a deck, with and without key lock.
 *
 * Without key lock the tempo and Harmony controls both drive the playback rate,
 * so pitch follows speed. With key lock the rate carries tempo only and Harmony
 * becomes a pure pitch control, applied by the SoundTouch worklet.
 */
export interface RateInput {
  keyLock: boolean;
  bpm: number;
  sourceBpm: number;
  keyShift: number;
}

export interface DeckRates {
  /** Rate the transport clock integrates and the source node plays at. */
  clockRate: number;
  /** Rate the worklet must mirror so it can compensate the pitch of the source. */
  workletRate: number;
  /** Pitch multiplier the worklet applies. Always 1 when the worklet is bypassed. */
  workletPitch: number;
}

export function resolveRates({ keyLock, bpm, sourceBpm, keyShift }: RateInput): DeckRates {
  const tempo = bpm / sourceBpm;
  const harmony = Math.pow(2, keyShift / 12);
  if (!keyLock) return { clockRate: tempo * harmony, workletRate: tempo * harmony, workletPitch: 1 };
  return { clockRate: tempo, workletRate: tempo, workletPitch: harmony };
}

/** Beat rate actually heard: Harmony changes it only when key lock is off. */
export function audibleBpm({ keyLock, bpm, keyShift }: Omit<RateInput, 'sourceBpm'>): number {
  return keyLock ? bpm : bpm * Math.pow(2, keyShift / 12);
}

/** Nominal tempo to hand a target deck so its audible beat rate matches `audible`. */
export function tempoForAudible(audible: number, keyLock: boolean, keyShift: number): number {
  return keyLock ? audible : audible / Math.pow(2, keyShift / 12);
}
