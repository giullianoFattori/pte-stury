import { RUNTIME_VERSION, API_VERSION, ENGINE, ENGINE_VERSION, detectBuild, metadata } from './version.mjs';

export function createRuntimeState(config) {
  return Object.freeze({ status: 'starting', runtimeVersion: RUNTIME_VERSION, apiVersion: API_VERSION,
    engine: ENGINE, engineVersion: ENGINE_VERSION, modelId: config.model, modelLoaded: false, build: detectBuild() });
}

export function healthResponse(state) {
  return { status: state.status, ...metadata(state), model: { id: state.modelId, loaded: state.modelLoaded }, processedLocally: true,
    ...(state.error ? { error: { ...state.error } } : {}) };
}
