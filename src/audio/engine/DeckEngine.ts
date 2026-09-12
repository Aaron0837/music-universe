import type { BeatGrid, DeckSnapshot } from '../../types/models';
import { analyzeBuffer } from '../analysis/analyzeBuffer';
import type { TrackAnalysis } from '../analysis/beatAnalysis';
import { TransportClock } from './TransportClock';

export class DeckEngine {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  readonly output: GainNode;
  readonly clock = new TransportClock();
  peaks = new Float32Array(768);
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private reverseBuffer?: AudioBuffer;
  private sourceBpm = 120;
  private bpm = 120;
  private keyShift = 0;
  private volume = 0.86;
  private loopBeats = 4;
  private grid?: BeatGrid;
  private cues: Array<number | null> = [null, null, null, null];
  private trackId?: string;
  private listener?: (snapshot: DeckSnapshot) => void;
  private status: DeckSnapshot['status'] = 'empty';
  private error?: string;
  private generation = 0;
  private playGeneration = 0;
  private revision = 0;
  private analysisPending = false;
  private analysisAbort?: AbortController;
  private disposed = false;
  onAnalysis?: (id: string, analysis: TrackAnalysis) => void;
  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly filter: BiquadFilterNode;
  private readonly dry: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly delayWet: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly reverbWet: GainNode;
  private readonly flanger: DelayNode;
  private readonly flangerWet: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly lfoDepth: GainNode;
  private filterValue = 1;
  private eq = { low: 0, mid: 0, high: 0 };
  private effects = { delay: 0, reverb: 0, flanger: 0 };

  constructor(private readonly context: AudioContext) {
    this.input = context.createGain();
    this.input.gain.value = this.volume;
    this.low = context.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 220;
    this.mid = context.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1200;
    this.mid.Q.value = 0.8;
    this.high = context.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 5000;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.dry = context.createGain();
    this.delay = context.createDelay(2);
    this.delay.delayTime.value = 0.28;
    this.feedback = context.createGain();
    this.feedback.gain.value = 0.28;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0;
    this.convolver = context.createConvolver();
    this.convolver.buffer = this.createImpulse(1.8, 2.5);
    this.reverbWet = context.createGain();
    this.reverbWet.gain.value = 0;
    this.flanger = context.createDelay(0.05);
    this.flanger.delayTime.value = 0.006;
    this.flangerWet = context.createGain();
    this.flangerWet.gain.value = 0;
    this.lfo = context.createOscillator();
    const lfoDepth = this.lfoDepth = context.createGain();
    lfoDepth.gain.value = 0.003;
    this.lfo.frequency.value = 0.22;
    this.lfo.connect(lfoDepth).connect(this.flanger.delayTime);
    this.lfo.start();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.output = context.createGain();

    this.input.connect(this.low).connect(this.mid).connect(this.high).connect(this.filter);
    this.filter.connect(this.dry).connect(this.analyser);
    this.filter.connect(this.delay).connect(this.delayWet).connect(this.analyser);
    this.delay.connect(this.feedback).connect(this.delay);
    this.filter.connect(this.convolver).connect(this.reverbWet).connect(this.analyser);
    this.filter.connect(this.flanger).connect(this.flangerWet).connect(this.analyser);
    this.analyser.connect(this.output);
  }


  onSnapshot(listener: (snapshot: DeckSnapshot) => void): () => void {
    this.listener = listener;
    this.emit();
    return () => { if (this.listener === listener) this.listener = undefined; };
  }

  async load(trackId: string, blob: Blob, cached?: TrackAnalysis): Promise<boolean> {
    const generation = this.beginLoad();
    try {
      const decoded = await this.context.decodeAudioData(await blob.arrayBuffer());
      if (generation !== this.generation || this.disposed) return false;
      this.install(trackId, decoded, cached);
      return true;
    } catch (error) {
      if (generation !== this.generation || this.disposed) return false;
      this.status = 'error';
      this.error = '浏览器无法解码这首音乐，请尝试 WAV 或 MP3。';
      this.emit();
      throw error;
    }
  }

  loadBuffer(trackId: string, buffer: AudioBuffer, bpm = 124): void {
    this.beginLoad();
    this.install(trackId, buffer, { grid: { bpm, firstBeat: 0, confidence: 1, source: 'demo', version: 1 }, peaks: this.makePeaks(buffer) });
  }

  private beginLoad(): number {
    this.pause();
    this.generation++;
    this.analysisAbort?.abort();
    this.buffer = undefined; this.reverseBuffer = undefined;
    this.clock.duration = 0; this.clock.loop = undefined; this.clock.reverse = false;
    this.clock.anchor(0, this.context.currentTime);
    this.trackId = undefined; this.grid = undefined;
    this.cues = [null, null, null, null];
    this.peaks = new Float32Array(768);
    this.status = 'loading'; this.error = undefined; this.analysisPending = false;
    this.revision++;
    this.emit();
    return this.generation;
  }

  private install(trackId: string, buffer: AudioBuffer, cached?: TrackAnalysis): void {
    this.buffer = buffer;
    this.trackId = trackId;
    this.clock.duration = buffer.duration;
    this.grid = cached?.grid;
    this.sourceBpm = this.bpm = this.grid?.bpm ?? 120;
    this.keyShift = 0;
    this.clock.setSpeed(1, this.context.currentTime, 0);
    this.status = 'ready';
    if (cached?.peaks.length) this.peaks = new Float32Array(cached.peaks);
    this.emit();
    if (!cached) {
      const generation = this.generation;
      const abort = this.analysisAbort = new AbortController();
      this.analysisPending = true;
      this.emit();
      void analyzeBuffer(buffer, abort.signal).then((result) => {
        if (generation !== this.generation || abort.signal.aborted) return;
        this.peaks = result.peaks;
        if (this.grid?.source !== 'manual') {
          const ratio = this.bpm / this.sourceBpm;
          this.grid = result.grid;
          this.sourceBpm = result.grid?.bpm ?? 120;
          this.bpm = Math.max(60, Math.min(200, this.sourceBpm * ratio));
          this.updateRate();
        }
        this.analysisPending = false;
        this.onAnalysis?.(trackId, { grid: this.grid, peaks: this.peaks });
        this.emit();
      }).catch((error: Error) => {
        if (abort.signal.aborted || generation !== this.generation) return;
        this.analysisPending = false; this.error = error.message; this.emit();
      });
    }
  }

  async play(): Promise<void> {
    if (!this.buffer || this.clock.playing || this.disposed) return;
    const generation = ++this.playGeneration;
    await this.context.resume();
    if (generation !== this.playGeneration || !this.buffer || this.disposed) return;
    if (this.context.state !== 'running') throw new Error('浏览器尚未启用声音，请再次点击播放');
    let position = this.position;
    if (!this.clock.loop && ((!this.clock.reverse && position >= this.duration - 0.001) || (this.clock.reverse && position <= 0.001))) {
      position = this.clock.reverse ? this.duration : 0;
    }
    const source = this.context.createBufferSource();
    source.buffer = this.clock.reverse ? this.getReverseBuffer() : this.buffer;
    const rate = this.effectiveRate;
    source.playbackRate.value = rate;
    this.clock.setSpeed(rate, this.context.currentTime, 0);
    this.clock.anchor(position, this.context.currentTime);
    source.connect(this.input);
    this.source = source;
    this.applyLoop();
    source.onended = () => {
      if (this.source !== source) return;
      source.disconnect(); this.source = undefined;
      this.clock.playing = false;
      this.clock.anchor(this.clock.reverse ? 0 : this.duration, this.context.currentTime);
      this.emit();
    };
    source.start(0, this.clock.reverse ? Math.max(0, this.duration - position) : position);
    this.clock.playing = true;
    this.emit();
  }

  pause(): void {
    const position = this.position;
    this.stopSource();
    this.clock.anchor(position, this.context.currentTime);
    this.emit();
  }

  async toggle(): Promise<void> { if (this.isPlaying) this.pause(); else await this.play(); }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds) || !this.buffer) return;
    const resume = this.isPlaying;
    this.stopSource();
    this.clock.loop = undefined;
    this.clock.anchor(Math.max(0, Math.min(this.duration, seconds)), this.context.currentTime);
    this.revision++;
    if (resume) this.resumeAfterCommand();
    this.emit();
  }

  scratch(deltaSeconds: number): void { this.seek(this.position + deltaSeconds); }

  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    this.bpm = Math.max(60, Math.min(200, bpm));
    this.updateRate();
    this.emit();
  }

  setKey(semitones: number): void {
    if (!Number.isFinite(semitones)) return;
    this.keyShift = Math.max(-12, Math.min(12, Math.round(semitones)));
    this.updateRate();
    this.emit();
  }

  private get effectiveRate(): number { return this.bpm / this.sourceBpm * Math.pow(2, this.keyShift / 12); }

  private updateRate(): void {
    const now = this.context.currentTime;
    const rate = this.effectiveRate;
    const from = this.clock.setSpeed(rate, now);
    if (this.source) {
      this.source.playbackRate.cancelScheduledValues(now);
      this.source.playbackRate.setValueAtTime(from, now);
      this.source.playbackRate.linearRampToValueAtTime(rate, now + 0.025);
    }
  }

  setSourceBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 60 || bpm > 200 || !this.buffer) return;
    const ratio = this.bpm / this.sourceBpm;
    this.sourceBpm = bpm; this.bpm = Math.max(60, Math.min(200, bpm * ratio));
    this.updateRate();
    this.grid = { bpm, firstBeat: this.grid?.firstBeat ?? 0, confidence: 1, source: 'manual', version: 1 };
    this.clock.loop = undefined; this.applyLoop();
    this.revision++;
    this.onAnalysis?.(this.trackId!, { grid: this.grid, peaks: this.peaks });
    this.emit();
  }

  setFirstBeat(): void {
    if (!this.buffer) return;
    this.grid = { bpm: this.sourceBpm, firstBeat: this.position, confidence: 1, source: 'manual', version: 1 };
    this.revision++;
    if (this.trackId) this.onAnalysis?.(this.trackId, { grid: this.grid, peaks: this.peaks });
    this.emit();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.input.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01);
    this.emit();
  }

  setEq(band: 'low' | 'mid' | 'high', db: number): void {
    this.eq[band] = Math.max(-24, Math.min(12, db));
    this[band].gain.setTargetAtTime(this.eq[band], this.context.currentTime, 0.015);
    this.emit();
  }

  setFilter(value: number): void {
    this.filterValue = Math.max(0, Math.min(1, value));
    this.filter.frequency.setTargetAtTime(80 * Math.pow(250, this.filterValue), this.context.currentTime, 0.02);
    this.emit();
  }

  setEffect(effect: 'delay' | 'reverb' | 'flanger', wet: number): void {
    this.effects[effect] = Math.max(0, Math.min(0.8, wet));
    const node = effect === 'delay' ? this.delayWet : effect === 'reverb' ? this.reverbWet : this.flangerWet;
    node.gain.setTargetAtTime(Math.max(0, Math.min(0.8, wet)), this.context.currentTime, 0.02);
    this.emit();
  }

  setLoop(beats: number, enabled = true): void {
    if (!this.buffer || ![1, 2, 4, 8].includes(beats)) return;
    const position = this.position;
    const resume = this.isPlaying;
    this.stopSource();
    this.loopBeats = beats;
    this.clock.loop = undefined;
    if (enabled) {
      const beat = 60 / this.sourceBpm;
      const first = this.grid?.firstBeat ?? 0;
      const start = Math.max(0, first + Math.floor((position - first) / beat) * beat);
      const end = Math.min(this.duration, start + beats * beat);
      if (end - start > 0.02) this.clock.loop = { start, end };
    }
    this.clock.anchor(position, this.context.currentTime);
    this.revision++;
    if (resume) this.resumeAfterCommand();
    this.emit();
  }

  setCue(index: number): void { if (this.buffer && index >= 0 && index < 4) { this.cues[index] = this.position; this.emit(); } }
  clearCue(index: number): void { if (index >= 0 && index < 4) { this.cues[index] = null; this.emit(); } }
  jumpCue(index: number): void { const cue = this.cues[index]; if (cue !== null && cue !== undefined) this.seek(cue); }

  setReverse(enabled: boolean): void {
    if (!this.buffer || this.clock.reverse === enabled) return;
    const position = this.position, resume = this.isPlaying;
    this.stopSource();
    this.clock.reverse = enabled;
    this.clock.anchor(position, this.context.currentTime);
    this.revision++;
    if (resume) this.resumeAfterCommand();
    this.emit();
  }

  get position(): number { return this.clock.position(this.context.currentTime); }
  get duration(): number { return this.buffer?.duration ?? 0; }
  get currentBpm(): number { return this.bpm * Math.pow(2, this.keyShift / 12); }
  get isPlaying(): boolean { return this.clock.playing; }
  get isReverse(): boolean { return this.clock.reverse; }
  get transportRevision(): number { return this.revision; }
  get beatGrid(): BeatGrid | undefined { return this.grid; }
  get playbackRate(): number { return this.clock.speed(this.context.currentTime); }
  get loopRange(): { start: number; end: number } | undefined { return this.clock.loop; }

  snapshot(): DeckSnapshot {
    return { trackId: this.trackId, playing: this.isPlaying, position: this.position, duration: this.duration,
      volume: this.volume, bpm: this.bpm, sourceBpm: this.sourceBpm, keyShift: this.keyShift,
      low: this.eq.low, mid: this.eq.mid, high: this.eq.high, filter: this.filterValue, effects: { ...this.effects },
      loopBeats: this.loopBeats, loopEnabled: Boolean(this.clock.loop), reverse: this.clock.reverse,
      status: this.status, error: this.error, grid: this.grid, analysisPending: this.analysisPending,
      cues: [...this.cues], revision: this.revision };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    this.analysisAbort?.abort(); this.stopSource(); this.lfo.stop();
    [this.input, this.output, this.low, this.mid, this.high, this.filter, this.dry, this.delay,
      this.feedback, this.delayWet, this.convolver, this.reverbWet, this.flanger, this.flangerWet,
      this.lfo, this.lfoDepth, this.analyser].forEach((node) => node.disconnect());
    this.buffer = undefined; this.reverseBuffer = undefined; this.listener = undefined;
  }

  private applyLoop(): void {
    if (!this.source) return;
    const loop = this.clock.loop;
    this.source.loop = Boolean(loop);
    if (loop) {
      this.source.loopStart = this.clock.reverse ? this.duration - loop.end : loop.start;
      this.source.loopEnd = this.clock.reverse ? this.duration - loop.start : loop.end;
    }
  }

  private stopSource(): void {
    this.playGeneration++;
    this.clock.playing = false;
    if (!this.source) return;
    this.source.onended = null;
    try { this.source.stop(); } catch { /* stopped source */ }
    this.source.disconnect(); this.source = undefined;
  }

  private resumeAfterCommand(): void {
    void this.play().catch((error: Error) => { this.error = error.message; this.emit(); });
  }

  private emit(): void { this.listener?.(this.snapshot()); }

  private createImpulse(seconds: number, decay: number): AudioBuffer {
    const impulse = this.context.createBuffer(2, Math.floor(this.context.sampleRate * seconds), this.context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, decay);
    }
    return impulse;
  }

  private makePeaks(buffer: AudioBuffer): Float32Array<ArrayBuffer> {
    const data = buffer.getChannelData(0), peaks = new Float32Array(768);
    for (let i = 0; i < data.length; i++) {
      const index = Math.min(767, Math.floor(i / data.length * 768));
      peaks[index] = Math.max(peaks[index], Math.abs(data[i]));
    }
    return peaks;
  }

  private getReverseBuffer(): AudioBuffer {
    if (this.reverseBuffer) return this.reverseBuffer;
    const buffer = this.buffer!;
    const result = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) result.copyToChannel(new Float32Array(buffer.getChannelData(channel)).reverse(), channel);
    return this.reverseBuffer = result;
  }
}
