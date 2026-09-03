import type { DeckSnapshot } from '../../types/models';

type SnapshotListener = (snapshot: DeckSnapshot) => void;

export class DeckEngine {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  readonly output: GainNode;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private reverseBuffer?: AudioBuffer;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  private sourceBpm = 120;
  private bpm = 120;
  private keyShift = 0;
  private volume = 0.86;
  private loopBeats = 4;
  private loopEnabled = false;
  private loopStart = 0;
  private reverse = false;
  private trackId?: string;
  private listener?: SnapshotListener;
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
  private filterValue = 1;

  constructor(private readonly context: AudioContext) {
    this.input = context.createGain();
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
    const lfoDepth = context.createGain();
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

  onSnapshot(listener: SnapshotListener): void {
    this.listener = listener;
    this.emit();
  }

  async load(trackId: string, blob: Blob, bpm = 120): Promise<void> {
    this.stopSource();
    const bytes = await blob.arrayBuffer();
    this.buffer = await this.context.decodeAudioData(bytes.slice(0));
    this.reverseBuffer = undefined;
    this.reverse = false;
    this.trackId = trackId;
    this.sourceBpm = bpm;
    this.bpm = bpm;
    this.offset = 0;
    this.emit();
  }

  loadBuffer(trackId: string, buffer: AudioBuffer, bpm = 120): void {
    this.stopSource();
    this.buffer = buffer;
    this.reverseBuffer = undefined;
    this.reverse = false;
    this.trackId = trackId;
    this.sourceBpm = bpm;
    this.bpm = bpm;
    this.offset = 0;
    this.emit();
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    await this.context.resume();
    const source = this.context.createBufferSource();
    source.buffer = this.reverse ? this.getReverseBuffer() : this.buffer;
    source.playbackRate.value = this.bpm / this.sourceBpm;
    source.detune.value = this.keyShift * 100;
    if (this.loopEnabled && !this.reverse) this.applyLoop(source);
    source.connect(this.input);
    source.onended = () => {
      if (this.source === source && !source.loop) {
        this.playing = false;
        this.offset = 0;
        this.emit();
      }
    };
    this.source = source;
    this.startedAt = this.context.currentTime;
    const startOffset = this.reverse ? Math.max(0, this.buffer.duration - this.offset) : this.offset % this.buffer.duration;
    source.start(0, startOffset);
    this.playing = true;
    this.emit();
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.position;
    this.stopSource();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.playing) this.pause(); else await this.play();
  }

  seek(seconds: number): void {
    const wasPlaying = this.playing;
    this.offset = Math.max(0, Math.min(this.duration, seconds));
    this.stopSource();
    if (wasPlaying) void this.play();
    this.emit();
  }

  scratch(deltaSeconds: number): void {
    this.seek(this.position + deltaSeconds);
  }

  setTempo(bpm: number): void {
    const position = this.position;
    const wasPlaying = this.playing;
    this.offset = position;
    this.stopSource();
    this.bpm = Math.max(60, Math.min(200, bpm));
    if (wasPlaying) void this.play();
    this.emit();
  }

  setKey(semitones: number): void {
    this.keyShift = Math.max(-12, Math.min(12, Math.round(semitones)));
    if (this.source) this.source.detune.setTargetAtTime(this.keyShift * 100, this.context.currentTime, 0.015);
    this.emit();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.input.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01);
    this.emit();
  }

  setEq(band: 'low' | 'mid' | 'high', db: number): void {
    const node = band === 'low' ? this.low : band === 'mid' ? this.mid : this.high;
    node.gain.setTargetAtTime(Math.max(-24, Math.min(12, db)), this.context.currentTime, 0.015);
    this.emit();
  }

  setFilter(value: number): void {
    this.filterValue = Math.max(0, Math.min(1, value));
    const frequency = 80 * Math.pow(250, this.filterValue);
    this.filter.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.02);
    this.emit();
  }

  setEffect(effect: 'delay' | 'reverb' | 'flanger', wet: number): void {
    const node = effect === 'delay' ? this.delayWet : effect === 'reverb' ? this.reverbWet : this.flangerWet;
    node.gain.setTargetAtTime(Math.max(0, Math.min(0.8, wet)), this.context.currentTime, 0.02);
  }

  setLoop(beats: number, enabled = true): void {
    this.loopBeats = beats;
    this.loopEnabled = enabled;
    this.loopStart = this.position;
    if (this.source) {
      this.source.loop = enabled;
      if (enabled) this.applyLoop(this.source);
    }
    this.emit();
  }

  setReverse(enabled: boolean): void {
    if (this.reverse === enabled || !this.buffer) return;
    const position = this.position;
    const wasPlaying = this.playing;
    this.offset = position;
    this.stopSource();
    this.reverse = enabled;
    if (wasPlaying) void this.play();
    this.emit();
  }

  get position(): number {
    if (!this.playing) return this.offset;
    const rate = this.bpm / this.sourceBpm;
    const elapsed = (this.context.currentTime - this.startedAt) * rate;
    const current = this.reverse ? this.offset - elapsed : this.offset + elapsed;
    if (this.loopEnabled) {
      const length = this.loopBeats * 60 / this.bpm;
      return this.loopStart + ((current - this.loopStart) % length + length) % length;
    }
    return Math.max(0, Math.min(this.duration, current));
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get currentBpm(): number {
    return this.bpm;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  snapshot(): DeckSnapshot {
    return {
      trackId: this.trackId,
      playing: this.playing,
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      bpm: this.bpm,
      sourceBpm: this.sourceBpm,
      keyShift: this.keyShift,
      low: this.low.gain.value,
      mid: this.mid.gain.value,
      high: this.high.gain.value,
      filter: this.filterValue,
      loopBeats: this.loopBeats,
      loopEnabled: this.loopEnabled,
      reverse: this.reverse,
    };
  }

  dispose(): void {
    this.stopSource();
    this.lfo.stop();
    this.input.disconnect();
    this.output.disconnect();
  }

  private applyLoop(source: AudioBufferSourceNode): void {
    const duration = this.loopBeats * 60 / this.bpm;
    source.loop = true;
    source.loopStart = this.loopStart;
    source.loopEnd = Math.min(this.duration, this.loopStart + duration);
  }

  private stopSource(): void {
    if (!this.source) {
      this.playing = false;
      return;
    }
    this.source.onended = null;
    try { this.source.stop(); } catch { /* already stopped */ }
    this.source.disconnect();
    this.source = undefined;
    this.playing = false;
  }

  private emit(): void {
    this.listener?.(this.snapshot());
  }

  private createImpulse(seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(this.context.sampleRate * seconds);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return impulse;
  }

  private getReverseBuffer(): AudioBuffer {
    if (this.reverseBuffer || !this.buffer) return this.reverseBuffer ?? this.buffer!;
    const reversed = this.context.createBuffer(this.buffer.numberOfChannels, this.buffer.length, this.buffer.sampleRate);
    for (let channel = 0; channel < this.buffer.numberOfChannels; channel++) {
      const source = this.buffer.getChannelData(channel);
      const target = reversed.getChannelData(channel);
      for (let i = 0, end = source.length - 1; i < source.length; i++) target[i] = source[end - i];
    }
    this.reverseBuffer = reversed;
    return reversed;
  }
}
