import { SpeechToTextError } from './types.ts';
import type { SpeechToTextErrorCode, TranscriptionResult } from './types.ts';

export const SPEECH_RUNTIME_API_VERSION = 1;

export type SpeechRuntimeAvailability = 'ready' | 'starting' | 'unavailable' | 'incompatible' | 'error';
export type SpeechRuntimeHealthStatus = 'starting' | 'ready' | 'degraded' | 'error';

export const SPEECH_RUNTIME_ERROR_CODES = [
  'RUNTIME_UNAVAILABLE', 'RUNTIME_STARTING', 'MODEL_UNAVAILABLE',
  'AUDIO_EMPTY', 'AUDIO_TOO_LARGE', 'AUDIO_UNSUPPORTED', 'AUDIO_DECODE_FAILED',
  'NO_SPEECH', 'INFERENCE_TIMEOUT', 'INFERENCE_FAILED', 'REQUEST_CANCELLED',
  'RUNTIME_INCOMPATIBLE', 'INTERNAL_ERROR', 'INVALID_REQUEST', 'RUNTIME_BUSY',
] as const;
export type SpeechRuntimeErrorCode = typeof SPEECH_RUNTIME_ERROR_CODES[number];
export type SpeechRuntimeError = { code: SpeechRuntimeErrorCode; message: string };
export type SpeechRuntimeErrorResponse = { error: SpeechRuntimeError };

export type SpeechRuntimeVersion = {
  runtimeVersion: string;
  apiVersion: typeof SPEECH_RUNTIME_API_VERSION;
  engine: 'whisper.cpp';
  engineVersion: string;
  build: { platform: 'linux' | 'win32' | 'darwin'; arch: 'x64' | 'arm64' };
};

export type SpeechRuntimeHealth = Omit<SpeechRuntimeVersion, 'build'> & {
  status: SpeechRuntimeHealthStatus;
  model: { id: string; loaded: boolean };
  processedLocally: true;
  error?: SpeechRuntimeError;
};

export type SpeechRuntimeTiming = { audioMs: number; inferenceMs: number; totalMs: number };
export type SpeechRuntimeTranscription = {
  text: string;
  language: 'en';
  engine: 'whisper.cpp';
  model: string;
  processedLocally: true;
  timing: SpeechRuntimeTiming;
};

// Complete mapping, including errors synthesized by the future HTTP client.
const ERROR_MAPPING: Record<SpeechRuntimeErrorCode, { code: SpeechToTextErrorCode; message: string }> = {
  RUNTIME_UNAVAILABLE: { code: 'local-unavailable', message: 'The local speech runtime is unavailable.' },
  RUNTIME_STARTING: { code: 'local-unavailable', message: 'The local speech runtime is starting. Please try again shortly.' },
  MODEL_UNAVAILABLE: { code: 'local-unavailable', message: 'The local speech model is unavailable.' },
  AUDIO_EMPTY: { code: 'no-speech', message: 'The recording is empty. Please record your response again.' },
  AUDIO_TOO_LARGE: { code: 'recognition-failed', message: 'The recording exceeds the local speech runtime limits.' },
  AUDIO_UNSUPPORTED: { code: 'audio-track-unavailable', message: 'The recording format is not supported.' },
  AUDIO_DECODE_FAILED: { code: 'audio-track-unavailable', message: 'The recording audio could not be decoded.' },
  NO_SPEECH: { code: 'no-speech', message: 'No speech was detected in the recording.' },
  INFERENCE_TIMEOUT: { code: 'recognition-failed', message: 'Local transcription timed out. Please try again.' },
  INFERENCE_FAILED: { code: 'recognition-failed', message: 'The recording could not be transcribed locally.' },
  REQUEST_CANCELLED: { code: 'cancelled', message: 'Local transcription was cancelled.' },
  RUNTIME_INCOMPATIBLE: { code: 'unsupported', message: 'Runtime version is incompatible with this app.' },
  INTERNAL_ERROR: { code: 'recognition-failed', message: 'The local speech runtime returned an unexpected result.' },
  INVALID_REQUEST: { code: 'recognition-failed', message: 'The local transcription request was invalid.' },
  RUNTIME_BUSY: { code: 'recognition-failed', message: 'The local speech runtime is busy. Please try again shortly.' },
};

export function mapSpeechRuntimeError(code: SpeechRuntimeErrorCode): SpeechToTextError {
  const mapped = ERROR_MAPPING[code];
  return new SpeechToTextError(mapped.code, mapped.message);
}

export class SpeechRuntimeContractError extends Error {
  readonly code: 'INTERNAL_ERROR' | 'RUNTIME_INCOMPATIBLE';

  constructor(code: 'INTERNAL_ERROR' | 'RUNTIME_INCOMPATIBLE' = 'INTERNAL_ERROR') {
    super(ERROR_MAPPING[code].message);
    this.name = 'SpeechRuntimeContractError';
    this.code = code;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SpeechRuntimeContractError();
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new SpeechRuntimeContractError();
  return value;
}

function modelId(value: unknown): string {
  const id = text(value);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new SpeechRuntimeContractError();
  return id;
}

function version(value: unknown): string {
  const result = text(value);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(result)) {
    throw new SpeechRuntimeContractError();
  }
  const prerelease = result.split('+')[0].split('-').slice(1).join('-');
  if (prerelease.split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    throw new SpeechRuntimeContractError();
  }
  return result;
}

function metadata(value: Record<string, unknown>): Omit<SpeechRuntimeVersion, 'build'> {
  if (typeof value.apiVersion !== 'number' || !Number.isSafeInteger(value.apiVersion) || value.apiVersion < 1) {
    throw new SpeechRuntimeContractError();
  }
  if (value.apiVersion !== SPEECH_RUNTIME_API_VERSION) throw new SpeechRuntimeContractError('RUNTIME_INCOMPATIBLE');
  if (value.engine !== 'whisper.cpp') throw new SpeechRuntimeContractError('RUNTIME_INCOMPATIBLE');
  return { apiVersion: SPEECH_RUNTIME_API_VERSION, engine: value.engine,
    runtimeVersion: version(value.runtimeVersion), engineVersion: version(value.engineVersion) };
}

export function parseSpeechRuntimeVersion(input: unknown): SpeechRuntimeVersion {
  const value = record(input);
  const meta = metadata(value);
  const build = record(value.build);
  if ((build.platform !== 'linux' && build.platform !== 'win32' && build.platform !== 'darwin')
    || (build.arch !== 'x64' && build.arch !== 'arm64')) throw new SpeechRuntimeContractError();
  return { ...meta, build: { platform: build.platform, arch: build.arch } };
}

function runtimeError(input: unknown): SpeechRuntimeError {
  const value = record(input);
  const code = SPEECH_RUNTIME_ERROR_CODES.find(candidate => candidate === value.code);
  if (!code) throw new SpeechRuntimeContractError();
  return { code, message: text(value.message) };
}

export function parseSpeechRuntimeErrorResponse(input: unknown): SpeechRuntimeErrorResponse {
  return { error: runtimeError(record(input).error) };
}

export function parseSpeechRuntimeHealth(input: unknown): SpeechRuntimeHealth {
  const value = record(input);
  const meta = metadata(value);
  const model = record(value.model);
  if ((value.status !== 'ready' && value.status !== 'starting' && value.status !== 'degraded' && value.status !== 'error')
    || typeof model.loaded !== 'boolean' || value.processedLocally !== true
    || (value.status === 'ready' && (!model.loaded || value.error !== undefined))) throw new SpeechRuntimeContractError();
  return { ...meta, status: value.status, model: { id: modelId(model.id), loaded: model.loaded }, processedLocally: true,
    ...(value.error === undefined ? {} : { error: runtimeError(value.error) }) };
}

// null means no reachable runtime. Invalid payloads never become ready.
export function getSpeechRuntimeAvailability(input: unknown): SpeechRuntimeAvailability {
  if (input === null) return 'unavailable';
  try {
    const health = parseSpeechRuntimeHealth(input);
    return health.status === 'ready' ? 'ready' : health.status === 'starting' ? 'starting' : 'error';
  } catch (error) {
    return error instanceof SpeechRuntimeContractError && error.code === 'RUNTIME_INCOMPATIBLE' ? 'incompatible' : 'error';
  }
}

function milliseconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new SpeechRuntimeContractError();
  return value;
}

export function validateTranscriptionResultMetadata(result: Pick<TranscriptionResult, 'engine' | 'model' | 'audioMs' | 'inferenceMs' | 'totalMs'>): void {
  if (result.engine !== 'whisper.cpp' && result.engine !== 'browser-on-device') throw new SpeechRuntimeContractError();
  if (result.model !== undefined) modelId(result.model);
  for (const value of [result.audioMs, result.inferenceMs, result.totalMs]) {
    if (value !== undefined) milliseconds(value);
  }
  if (result.inferenceMs !== undefined && result.totalMs !== undefined && result.totalMs < result.inferenceMs) {
    throw new SpeechRuntimeContractError();
  }
}

export function parseSpeechRuntimeTranscription(input: unknown): SpeechRuntimeTranscription {
  const value = record(input);
  const timing = record(value.timing);
  if (value.engine !== 'whisper.cpp' || value.language !== 'en' || value.processedLocally !== true) throw new SpeechRuntimeContractError();
  const result: SpeechRuntimeTranscription = { text: text(value.text), language: 'en', engine: 'whisper.cpp',
    model: modelId(value.model), processedLocally: true,
    timing: { audioMs: milliseconds(timing.audioMs), inferenceMs: milliseconds(timing.inferenceMs), totalMs: milliseconds(timing.totalMs) } };
  validateTranscriptionResultMetadata({ engine: result.engine, model: result.model, ...result.timing });
  return result;
}

// Pure wire-to-domain mapping; no fetch, native execution or scoring belongs here.
export function toTranscriptionResult(input: unknown): TranscriptionResult {
  const value = parseSpeechRuntimeTranscription(input);
  return { text: value.text, language: value.language, engine: value.engine,
    model: value.model, processedLocally: value.processedLocally, ...value.timing };
}
