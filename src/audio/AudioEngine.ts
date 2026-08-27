import type { AudioFrame } from '../types';
import { averageBand, calculateRms, detectTransient, smooth } from './analysis';

type Listener = (state: { playing: boolean; name: string; duration: number }) => void;

export class AudioEngine {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private gain?: GainNode;
  private filter?: BiquadFilterNode;
  private element?: HTMLAudioElement;
  private source?: MediaElementAudioSourceNode;
  private demoNodes: AudioScheduledSourceNode[] = [];
  private demoBufferSource?: AudioBufferSourceNode;
  private objectUrl?: string;
  private listener?: Listener;
  private smoothBands = { bass: 0, mid: 0, treble: 0, rms: 0 };
  private energyAverage = 0;
  private pulse = 0;
  private demoStartedAt = 0;
  private demoPlaying = false;
  private readonly timeDomain = new Uint8Array(1024);
  private readonly frequencyBins = new Uint8Array(512);

  onState(listener: Listener): void { this.listener = listener; }

  private async ensureContext(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.76;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0.78;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 22000;
      this.gain.connect(this.filter);
      this.filter.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async loadFile(file: File): Promise<void> {
    if (file.size > 100 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    await this.ensureContext();
    this.stopDemo();
    if (!this.element) {
      this.element = new Audio();
      this.element.crossOrigin = 'anonymous';
      this.source = this.context!.createMediaElementSource(this.element);
      this.source.connect(this.gain!);
      this.element.addEventListener('play', () => this.emit());
      this.element.addEventListener('pause', () => this.emit());
      this.element.addEventListener('ended', () => this.emit());
      this.element.addEventListener('durationchange', () => this.emit());
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.element.src = this.objectUrl;
    this.element.dataset.name = file.name.replace(/\.[^.]+$/, '');
    try { await this.element.play(); } catch { throw new Error('DECODE_FAILED'); }
    this.emit();
  }

  async playDemo(): Promise<void> {
    await this.ensureContext();
    this.element?.pause();
    this.stopDemo();
    const context = this.context!;
    const duration = 32; const rate = context.sampleRate; const buffer = context.createBuffer(2, duration * rate, rate);
    const roots = [110, 130.81, 146.83, 164.81]; const melody = [440, 523.25, 659.25, 587.33, 493.88, 659.25, 783.99, 587.33];
    for (let channel = 0; channel < 2; channel++) { const data = buffer.getChannelData(channel); for (let i = 0; i < data.length; i++) { const t = i / rate; const beat = t % .5; const bar = Math.floor(t / 4) % 4; const step = Math.floor(t * 2) % 8; const kick = Math.sin(2 * Math.PI * (68 - beat * 55) * beat) * Math.exp(-beat * 19); const hatPhase = t % .25; const hat = (Math.sin(i * 12.9898) * .5 + Math.sin(i * 31.771) * .5) * Math.exp(-hatPhase * 55) * .055; const root = roots[bar]; const padEnv = .5 - .5 * Math.cos(Math.min(1, (t % 4) / .7) * Math.PI); const pad = (Math.sin(2 * Math.PI * root * 2 * t) + Math.sin(2 * Math.PI * root * 2.5 * t) + Math.sin(2 * Math.PI * root * 3 * t)) * .055 * padEnv; const leadPhase = t % .5; const lead = Math.sin(2 * Math.PI * melody[step] * t) * Math.exp(-leadPhase * 5) * .12; const bass = Math.tanh(Math.sin(2 * Math.PI * root * t) * 1.7) * .13; data[i] = Math.tanh((kick * .42 + hat + pad + lead + bass) * 1.25) * (channel ? .94 : 1); } }
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(this.gain!); source.start(); this.demoBufferSource = source;
    this.demoStartedAt = context.currentTime;
    this.demoPlaying = true;
    if (context.state !== 'running') await context.resume();
    this.emit();
  }

  private stopDemo(): void {
    this.demoPlaying = false;
    try { this.demoBufferSource?.stop(); } catch { /* already stopped */ }
    this.demoBufferSource?.disconnect(); this.demoBufferSource = undefined;
    for (const node of this.demoNodes) { try { node.stop(); } catch { /* already stopped */ } }
    this.demoNodes.length = 0;
  }

  async toggle(): Promise<void> {
    if (this.demoPlaying) { this.stopDemo(); this.emit(); return; }
    if (!this.element?.src) { await this.playDemo(); return; }
    await this.ensureContext();
    if (this.element.paused) await this.element.play(); else this.element.pause();
  }

  setVolume(value: number): void { if (this.gain && this.context) this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.02); }
  setFilter(value: number): void { if (this.filter && this.context) this.filter.frequency.setTargetAtTime(180 + Math.pow(value, 2.4) * 21820, this.context.currentTime, 0.025); }
  setBpm(bpm: number): void { if (this.demoBufferSource) this.demoBufferSource.playbackRate.value = Math.max(.65, Math.min(1.4, bpm / 120)); }
  async triggerDrum(kind: number): Promise<void> { await this.ensureContext(); const context = this.context!; const osc = context.createOscillator(); const gain = context.createGain(); const now = context.currentTime; const frequencies = [58, 190, 520, 920]; osc.type = kind === 0 ? 'sine' : kind === 1 ? 'triangle' : 'square'; osc.frequency.setValueAtTime(frequencies[kind] ?? 220, now); osc.frequency.exponentialRampToValueAtTime(Math.max(45, frequencies[kind] * .35), now + .11); gain.gain.setValueAtTime(kind > 1 ? .07 : .22, now); gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 0 ? .26 : .12)); osc.connect(gain).connect(this.gain!); osc.start(now); osc.stop(now + .28); this.demoNodes.push(osc); }
  async triggerHarmony(chord: number): Promise<void> { await this.ensureContext(); const context = this.context!; const roots = [261.63, 220, 174.61, 196]; const qualities = [[1,1.25,1.5],[1,1.2,1.5],[1,1.25,1.5],[1,1.25,1.5]]; const now = context.currentTime; qualities[chord % 4].forEach((ratio) => { const osc = context.createOscillator(); const gain = context.createGain(); osc.type = 'sine'; osc.frequency.value = roots[chord % 4] * ratio; gain.gain.setValueAtTime(.001, now); gain.gain.exponentialRampToValueAtTime(.075, now + .04); gain.gain.exponentialRampToValueAtTime(.001, now + .75); osc.connect(gain).connect(this.gain!); osc.start(now); osc.stop(now + .8); this.demoNodes.push(osc); }); }
  async triggerPerfect(): Promise<void> { await this.ensureContext(); const context = this.context!; const now = context.currentTime; const impact = context.createGain(); impact.gain.value = .82; impact.connect(this.gain!); [[96,38,.42,'sine'],[210,62,.24,'triangle']].forEach(([from,to,level,type]) => { const osc = context.createOscillator(); const gain = context.createGain(); osc.type = type as OscillatorType; osc.frequency.setValueAtTime(from as number, now); osc.frequency.exponentialRampToValueAtTime(to as number, now + .18); gain.gain.setValueAtTime(level as number, now); gain.gain.exponentialRampToValueAtTime(.001, now + .38); osc.connect(gain).connect(impact); osc.start(now); osc.stop(now + .4); this.demoNodes.push(osc); }); const length = Math.floor(context.sampleRate * .18); const noiseBuffer = context.createBuffer(1, length, context.sampleRate); const noise = noiseBuffer.getChannelData(0); for (let i = 0; i < length; i++) noise[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2); const source = context.createBufferSource(); const highpass = context.createBiquadFilter(); const noiseGain = context.createGain(); source.buffer = noiseBuffer; highpass.type = 'highpass'; highpass.frequency.value = 1200; noiseGain.gain.setValueAtTime(.18, now); noiseGain.gain.exponentialRampToValueAtTime(.001, now + .18); source.connect(highpass).connect(noiseGain).connect(impact); source.start(now); source.stop(now + .2); this.demoNodes.push(source); }
  seek(fraction: number): void { if (this.element && Number.isFinite(this.element.duration)) this.element.currentTime = fraction * this.element.duration; }
  get currentTime(): number { return this.demoPlaying && this.context ? (this.context.currentTime - this.demoStartedAt) % 32 : this.element?.currentTime ?? 0; }
  get duration(): number { return this.demoPlaying ? 32 : Number.isFinite(this.element?.duration) ? this.element!.duration : 0; }
  get playing(): boolean { return this.demoPlaying || Boolean(this.element && !this.element.paused); }
  get name(): string { return this.demoPlaying ? 'ORBITAL SIGNAL / GENERATED' : this.element?.dataset.name ?? 'NO SIGNAL'; }

  frame(delta: number): AudioFrame {
    this.analyser?.getByteTimeDomainData(this.timeDomain);
    this.analyser?.getByteFrequencyData(this.frequencyBins);
    const bass = averageBand(this.frequencyBins, 0, 0.08);
    const mid = averageBand(this.frequencyBins, 0.08, 0.34);
    const treble = averageBand(this.frequencyBins, 0.34, 0.82);
    const rms = calculateRms(this.timeDomain);
    this.smoothBands.bass = smooth(this.smoothBands.bass, bass);
    this.smoothBands.mid = smooth(this.smoothBands.mid, mid);
    this.smoothBands.treble = smooth(this.smoothBands.treble, treble);
    this.smoothBands.rms = smooth(this.smoothBands.rms, rms);
    const energy = bass * 0.55 + mid * 0.3 + treble * 0.15;
    this.energyAverage += (energy - this.energyAverage) * Math.min(1, delta * 2.5);
    const transient = detectTransient(energy, this.energyAverage);
    this.pulse = Math.max(transient, this.pulse - delta * 2.2);
    return { timeDomain: this.timeDomain, frequencyBins: this.frequencyBins, ...this.smoothBands, transient, beatPulse: this.pulse };
  }

  private emit(): void { this.listener?.({ playing: this.playing, name: this.name, duration: this.duration }); }
  dispose(): void { this.stopDemo(); this.element?.pause(); if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); void this.context?.close(); }
}
