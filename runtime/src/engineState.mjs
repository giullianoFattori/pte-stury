import { createRuntimeState } from './health.mjs';

// Only runtime internals receive these transition functions; routes read snapshots.
export function createEngineState(config) {
  let current = createRuntimeState(config);
  return Object.freeze({
    snapshot: () => Object.freeze({ ...current, build: Object.freeze({ ...current.build }),
      ...(current.error ? { error: Object.freeze({ ...current.error }) } : {}) }),
    markReady() { current = { ...current, status: 'ready', modelLoaded: true }; delete current.error; },
    markStarting() { current = { ...current, status: 'starting', modelLoaded: false }; delete current.error; },
    markError(code, message) { current = { ...current, status: 'error', modelLoaded: false, error: { code, message } }; },
  });
}
