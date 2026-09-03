import { MixerEngine } from './MixerEngine';

let mixer: MixerEngine | undefined;

export function getMixer(): MixerEngine {
  mixer ??= new MixerEngine();
  return mixer;
}

export function peekMixer(): MixerEngine | undefined {
  return mixer;
}
