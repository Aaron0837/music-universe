import type { DeckId, VisualizerFrame } from '../../types/models';
import { averageBand, calculateRms } from '../audioMath';
import { tempoForAudible } from '../keylock/keyLockMath';
import { DeckEngine } from './DeckEngine';
import { equalPowerGains } from './mixerMath';
import { syncPosition } from './syncMath';

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
  private lastFeedback = -1;
  private readonly visualFrame: VisualizerFrame;

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
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 3; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.12;
    this.master.connect(limiter).connect(this.analyser).connect(this.context.destination);
    this.decks = { A: new DeckEngine(this.context), B: new DeckEngine(this.context) };
    this.decks.A.output.connect(this.crossA);
    this.decks.B.output.connect(this.crossB);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
    this.visualFrame = { frequencyBins: this.bins, timeDomain: this.wave, bass: 0, mid: 0, treble: 0, rms: 0, beatPulse: 0, bpm: 120 };
    this.setCrossfader(0);
  }

  async unlock(): Promise<void> {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('浏览器尚未启用声音，请再次点击播放');
  }

  setCrossfader(position: number): void {
    const [a, b] = equalPowerGains(position);
    this.crossA.gain.setTargetAtTime(a, this.context.currentTime, 0.01);
    this.crossB.gain.setTargetAtTime(b, this.context.currentTime, 0.01);
  }

  setMasterVolume(value: number): void {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.context.currentTime, 0.01);
  }

  sync(source: DeckId, target: DeckId): string {
    const a = this.decks[source], b = this.decks[target];
    if (!a.duration || !b.duration) return '请先载入两个 Deck';
    if (a.snapshot().reverse || b.snapshot().reverse) return '请关闭倒放后再同步';
    if (!a.beatGrid || !b.beatGrid || Math.min(a.beatGrid.confidence, b.beatGrid.confidence) < 0.5) return '拍点置信度不足，请用 Tap Tempo 或手动 BPM 和首拍校准';
    const tempo = tempoForAudible(a.currentBpm, b.snapshot().keyLock, b.snapshot().keyShift);
    if (tempo < 60 || tempo > 200) return '目标速度超出 60–200 BPM，请先调整 Harmony';
    b.setTempo(tempo);
    b.seek(Math.min(b.duration, syncPosition(a.position, a.beatGrid, b.position, b.beatGrid)));
    return `Deck ${target} 已匹配 Deck ${source} 的速度与拍点`;
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

  triggerPerfect(volume = 0.5, harmony = false): void {
    const now = this.context.currentTime;
    if (now - this.lastFeedback < 0.055 || this.context.state !== 'running') return;
    this.lastFeedback = now;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.setValueAtTime(110, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.16);
    gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)) * 0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    if (harmony) for (const frequency of [261.63, 329.63, 392]) {
      const tone = this.context.createOscillator(), envelope = this.context.createGain();
      tone.frequency.value = frequency; envelope.gain.setValueAtTime(volume * 0.045, now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      tone.connect(envelope).connect(this.master); tone.start(now); tone.stop(now + 0.36);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    }
  }

  frame(bpm = this.decks.A.currentBpm): VisualizerFrame {
    this.analyser.getByteFrequencyData(this.bins);
    this.analyser.getByteTimeDomainData(this.wave);
    const grid = this.decks.A.beatGrid;
    const beatLength = 60 / (grid?.bpm ?? 120);
    const beatPhase = (((this.decks.A.position - (grid?.firstBeat ?? 0)) / beatLength) % 1 + 1) % 1;
    const pulse = beatPhase < this.lastBeat ? 1 : Math.max(0, 1 - beatPhase * 8);
    this.lastBeat = beatPhase;
    return Object.assign(this.visualFrame, {
      frequencyBins: this.bins,
      timeDomain: this.wave,
      bass: averageBand(this.bins, 0, 0.08),
      mid: averageBand(this.bins, 0.08, 0.36),
      treble: averageBand(this.bins, 0.36, 0.82),
      rms: calculateRms(this.wave),
      beatPulse: this.decks.A.isPlaying ? pulse : 0,
      bpm,
    });
  }

  dispose(): void {
    this.decks.A.dispose();
    this.decks.B.dispose();
    void this.context.close();
  }
}
