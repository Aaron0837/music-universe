/**
 * Offline verification that key lock really preserves pitch.
 *
 * Renders a pure tone through the same SoundTouch worklet the deck uses and
 * measures the fundamental, so a regression that silently stops compensating
 * shows up as a pitch change rather than a passing test.
 */
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

// Loaded on demand for the same reason as in worklet.ts: a static import of the
// library throws in browsers without AudioWorklet and breaks the harness page.
const loadModule = () => import('@soundtouchjs/audio-worklet');

const SAMPLE_RATE = 44100;
const TONE_HZ = 440;

/** Hann-windowed DFT peak search — enough to read a pure tone's fundamental. */
export function dominantFrequency(data: Float32Array, sampleRate = SAMPLE_RATE, lo = 100, hi = 1400): number {
  const size = Math.min(8192, data.length);
  const start = Math.max(0, Math.floor(data.length / 2 - size / 2));
  const window = data.subarray(start, start + size);
  let bestFrequency = 0;
  let bestMagnitude = -1;
  for (let frequency = lo; frequency <= hi; frequency++) {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < window.length; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (window.length - 1));
      const value = window[i] * hann;
      real += value * Math.cos(omega * i);
      imaginary += value * Math.sin(omega * i);
    }
    const magnitude = real * real + imaginary * imaginary;
    if (magnitude > bestMagnitude) { bestMagnitude = magnitude; bestFrequency = frequency; }
  }
  return bestFrequency;
}

export function toneBuffer(context: BaseAudioContext, frequency = TONE_HZ, seconds = 1): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.sin((2 * Math.PI * frequency * i) / context.sampleRate) * 0.6;
  return buffer;
}

export interface PitchProbe {
  frequency: number;
  duration: number;
}

/** Renders the tone through the worklet and measures what actually came out. */
export async function probePitch(rate: number, semitones: number): Promise<PitchProbe> {
  const { processOffline } = await loadModule();
  const context = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  const rendered = await processOffline({
    input: toneBuffer(context),
    processorUrl,
    playbackRate: rate,
    pitchSemitones: semitones,
  });
  return {
    frequency: dominantFrequency(rendered.getChannelData(0)),
    duration: +rendered.duration.toFixed(3),
  };
}

/** A plain source at the same rate, as the control that proves the probe detects pitch. */
export async function probePlainRate(rate: number): Promise<PitchProbe> {
  const context = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
  const buffer = context.createBuffer(1, Math.floor(SAMPLE_RATE), SAMPLE_RATE);
  buffer.copyToChannel(toneBuffer(context).getChannelData(0), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return { frequency: dominantFrequency(rendered.getChannelData(0)), duration: +rendered.duration.toFixed(3) };
}

export const expectedSemitoneRatio = (semitones: number) => Math.pow(2, semitones / 12);
