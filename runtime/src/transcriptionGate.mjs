import { AudioRequestError } from './errors.mjs';
export function createTranscriptionGate() {
  let active = false;
  return { acquire() {
    if (active) throw new AudioRequestError(429, 'RUNTIME_BUSY', 'The runtime is processing another recording.');
    active = true;
    let released = false;
    return () => { if (!released) { released = true; active = false; } };
  } };
}
