import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

/** True when this browser can support key lock, used to gate the UI control. */
export function keyLockSupported(): boolean {
  return typeof AudioWorkletNode !== 'undefined' && typeof AudioContext !== 'undefined';
}

type WorkletModule = typeof import('@soundtouchjs/audio-worklet');

/**
 * Loads the SoundTouch library on demand.
 *
 * It must never be a static import: the package declares `class SoundTouchNode
 * extends AudioWorkletNode` at module scope, so evaluating it in a browser
 * without AudioWorklet throws and takes the whole app down before React mounts.
 * The `?url` import above is safe — it resolves to a string, not the module.
 */
async function loadWorkletModule(): Promise<WorkletModule | undefined> {
  if (!keyLockSupported()) return undefined;
  try {
    return await import('@soundtouchjs/audio-worklet');
  } catch {
    return undefined;
  }
}

/**
 * Creates a worklet node wired to the context, or `undefined` when the browser
 * cannot run AudioWorklet (older Safari, or a non-secure origin).
 */
export async function createKeyLockNode(context: BaseAudioContext): Promise<SoundTouchNode | undefined> {
  const module = await loadWorkletModule();
  if (!module) return undefined;
  try {
    let pending = registrations.get(context);
    if (!pending) {
      pending = module.SoundTouchNode.register(context, processorUrl);
      registrations.set(context, pending);
    }
    await pending;
    return new module.SoundTouchNode({ context });
  } catch {
    return undefined;
  }
}
