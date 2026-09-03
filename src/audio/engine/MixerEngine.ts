import type { DeckId, VisualizerFrame } from '../../types/models';
import { averageBand, calculateRms } from '../analysis';
import { DeckEngine } from './DeckEngine';
import { equalPowerGains } from './mixerMath';

export class MixerEngine {
  readonly context: AudioContext;
  readonly decks: Record<DeckId, DeckEngine>;
  private readonly crossA: GainNode;
  private readonly crossB: GainNode;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly bins: Uint8Array<ArrayBuffer>;
  private readonly wave: Uint8Array<ArrayBuffer>;
  private lastBeat = 0;

  constructor() {
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.crossA = this.context.createGain();
    this.crossB = this.context.createGain();
    this.master = this.context.createGain();
    this.master.gain.value = 0.8;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.crossA.connect(this.master);
    this.crossB.connect(this.master);
    this.master.connect(this.analyser).connect(this.context.destination);
    this.decks = { A: new DeckEngine(this.context), B: new DeckEngine(this.context) };
    this.decks.A.output.connect(this.crossA);
    this.decks.B.output.connect(this.crossB);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
    this.setCrossfader(0);
  }

  async unlock(): Promise<void> {
    await this.context.resume();
  }

  setCrossfader(position: number): void {
    const [a, b] = equalPowerGains(position);
    this.crossA.gain.setTargetAtTime(a, this.context.currentTime, 0.01);
    this.crossB.gain.setTargetAtTime(b, this.context.currentTime, 0.01);
  }

  setMasterVolume(value: number): void {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.context.currentTime, 0.01);
  }

  sync(source: DeckId, target: DeckId): void {
    this.decks[target].setTempo(this.decks[source].currentBpm);
  }

  createDemo(): AudioBuffer {
    const bpm = 124;
    const duration = 32;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(2, duration * sampleRate, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const time = i / sampleRate;
        const beatPhase = (time * bpm / 60) % 1;
        const kick = Math.sin(2 * Math.PI * (48 + 80 * Math.exp(-beatPhase * 25)) * time) * Math.exp(-beatPhase * 18);
        const hatPhase = (time * bpm / 30) % 1;
        const hat = (Math.random() * 2 - 1) * Math.exp(-hatPhase * 55) * 0.13;
        const note = [55, 65.41, 73.42, 82.41][Math.floor(time / 2) % 4];
        const bass = Math.sin(2 * Math.PI * note * time) * (0.16 + 0.08 * Math.sin(Math.PI * beatPhase));
        const pad = Math.sin(2 * Math.PI * note * 2 * time) * 0.045;
        data[i] = Math.tanh(kick * 0.72 + bass + hat + pad);
      }
    }
    return buffer;
  }

  triggerPerfect(): void {
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(110, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.16);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  }

  frame(bpm = 120): VisualizerFrame {
    this.analyser.getByteFrequencyData(this.bins);
    this.analyser.getByteTimeDomainData(this.wave);
    const beatLength = 60 / bpm;
    const beatPhase = (this.context.currentTime % beatLength) / beatLength;
    const pulse = beatPhase < this.lastBeat ? 1 : Math.max(0, 1 - beatPhase * 8);
    this.lastBeat = beatPhase;
    return {
      frequencyBins: this.bins,
      timeDomain: this.wave,
      bass: averageBand(this.bins, 0, 0.08),
      mid: averageBand(this.bins, 0.08, 0.36),
      treble: averageBand(this.bins, 0.36, 0.82),
      rms: calculateRms(this.wave),
      beatPulse: pulse,
      bpm,
    };
  }

  dispose(): void {
    this.decks.A.dispose();
    this.decks.B.dispose();
    void this.context.close();
  }
}
