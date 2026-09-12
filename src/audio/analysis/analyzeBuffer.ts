import type { TrackAnalysis } from './beatAnalysis';

export function analyzeBuffer(buffer: AudioBuffer, signal: AbortSignal): Promise<TrackAnalysis> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Analysis cancelled', 'AbortError'));
    const worker = new Worker(new URL('./beat.worker.ts', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(new DOMException('Analysis cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<TrackAnalysis>) => { clean(); resolve(event.data); };
    worker.onerror = () => { clean(); reject(new Error('拍点分析失败，可手动设置 BPM')); };
    const samples = new Float32Array(buffer.getChannelData(0));
    worker.postMessage({ samples, sampleRate: buffer.sampleRate }, [samples.buffer]);
  });
}
