import { analyzeSamples } from './beatAnalysis';

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  const result = analyzeSamples(event.data.samples, event.data.sampleRate);
  self.postMessage(result, { transfer: [result.peaks.buffer] });
};
