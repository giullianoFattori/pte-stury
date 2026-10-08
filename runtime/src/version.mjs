import { RuntimeStartupError } from './errors.mjs';

// Engine baseline verified against local build metadata before readiness.
export const RUNTIME_VERSION = '0.1.0';
export const API_VERSION = 1;
export const ENGINE = 'whisper.cpp';
export const ENGINE_VERSION = '1.8.3';
export const ENGINE_REVISION = '2eeeba56e9edd762b4b38467bab96c2517163158';

export function detectBuild(platform = process.platform, arch = process.arch) {
  if (!['linux', 'win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new RuntimeStartupError('UNSUPPORTED_BUILD', 'Runtime platform or architecture is not supported.');
  }
  return Object.freeze({ platform, arch });
}

export function metadata(state) {
  return { runtimeVersion: state.runtimeVersion, apiVersion: state.apiVersion,
    engine: state.engine, engineVersion: state.engineVersion };
}

export function versionResponse(state) { return { ...metadata(state), build: { ...state.build } }; }
