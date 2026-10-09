import {
  mapSpeechRuntimeError, parseSpeechRuntimeErrorResponse, parseSpeechRuntimeHealth,
  SpeechRuntimeContractError, toTranscriptionResult,
} from '../../domain/speech/runtimeTypes.ts';
import { SpeechToTextError } from '../../domain/speech/types.ts';

async function request(path: '/health' | '/transcribe', init: RequestInit): Promise<unknown> {
  try {
    if (init.signal?.aborted) throw mapSpeechRuntimeError('REQUEST_CANCELLED');
    const response = await fetch(`/api/v1${path}`, {
      ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    });
    const payload: unknown = await response.json();
    if (init.signal?.aborted) throw mapSpeechRuntimeError('REQUEST_CANCELLED');
    if (!response.ok) throw mapSpeechRuntimeError(parseSpeechRuntimeErrorResponse(payload).error.code);
    return payload;
  } catch (error) {
    if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw mapSpeechRuntimeError('REQUEST_CANCELLED');
    }
    if (error instanceof SpeechToTextError) throw error;
    if (error instanceof SpeechRuntimeContractError) throw mapSpeechRuntimeError(error.code);
    if (error instanceof SyntaxError) throw mapSpeechRuntimeError('INTERNAL_ERROR');
    throw mapSpeechRuntimeError('RUNTIME_UNAVAILABLE');
  }
}

function parse<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    throw mapSpeechRuntimeError(error instanceof SpeechRuntimeContractError ? error.code : 'INTERNAL_ERROR');
  }
}

export async function getSpeechRuntimeHealth(signal?: AbortSignal) {
  const payload = await request('/health', { method: 'GET', signal });
  return parse(() => parseSpeechRuntimeHealth(payload));
}

export async function transcribeWithSpeechRuntime(audio: Blob, signal?: AbortSignal) {
  const body = new FormData();
  body.append('audio', audio, 'recording');
  body.append('language', 'en');
  const payload = await request('/transcribe', { method: 'POST', body, signal });
  return parse(() => toTranscriptionResult(payload));
}
