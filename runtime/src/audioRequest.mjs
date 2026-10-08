import { performance } from 'node:perf_hooks';
import { buildTranscriptionResponse } from './transcriptionResponse.mjs';
import { PREPROCESS_TIMEOUT_MS } from './media.mjs';
import { randomUUID } from 'node:crypto';
import { AudioRequestError } from './errors.mjs';
import { receiveAudio, uploadBoundary } from './multipart.mjs';
import { preprocessAudio } from './preprocess.mjs';

// Includes the existing 10 s body deadline, preprocessing, inference and 5 s overhead.
export const requestBudgetMs = config => 10000 + PREPROCESS_TIMEOUT_MS + config.inferenceTimeoutMs + 5000;

export async function processAudioRequest(request, response, config, services) {
  const started = performance.now();
  const boundary = uploadBoundary(request, config);
  const release = services.gate.acquire();
  const controller = new AbortController();
  services.controllers.add(controller);
  const cancelled = () => controller.abort(new AudioRequestError(499, 'REQUEST_CANCELLED', 'The audio request was cancelled.'));
  const closed = () => { if (!response.writableFinished) cancelled(); };
  request.once('aborted', cancelled);
  response.once('close', closed);
  if (request.destroyed || response.destroyed) cancelled();
  const timer = setTimeout(() => {
    controller.abort(new AudioRequestError(504, 'INFERENCE_TIMEOUT', 'The audio request timed out.'));
    if (!request.complete) request.destroy();
  }, requestBudgetMs(config));
  // Abort interrupts a pending streaming read; preprocessing listens to the same signal.
  const stopReading = () => { if (!request.complete) request.destroy(); };
  controller.signal.addEventListener('abort', stopReading, { once: true });
  let files, failure, evidence, inference;
  try {
    controller.signal.throwIfAborted();
    files = await services.temp.create();
    const upload = await receiveAudio(request, files.inputPath, boundary, config, controller.signal);
    const audio = await preprocessAudio(files, config, controller.signal, services.preprocessOptions);
    controller.signal.throwIfAborted();
    evidence = { requestId: randomUUID(), ...upload, ...audio };
    await services.onNormalized?.(evidence, controller.signal);
    controller.signal.throwIfAborted();
    inference = await services.whisper.transcribeNormalizedAudio({ normalizedPath: audio.normalizedPath, modelId: config.model, signal: controller.signal });
    controller.signal.throwIfAborted();
  } catch (error) {
    failure = error;
    if (['MODEL_UNAVAILABLE', 'RUNTIME_UNAVAILABLE'].includes(error.code)) services.engineState.markError(error.code, error.message);
  } finally {
    try { await files?.remove(); } catch {
      services.cleanupFailed = true;
      services.engineState.markError('INTERNAL_ERROR', 'Runtime temporary storage cleanup failed.');
      failure = new AudioRequestError(500, 'INTERNAL_ERROR', 'Runtime temporary storage cleanup failed.');
    } finally {
      clearTimeout(timer);
      request.removeListener('aborted', cancelled);
      response.removeListener('close', closed);
      controller.signal.removeEventListener('abort', stopReading);
      services.controllers.delete(controller);
      release();
    }
  }
  if (failure) throw failure;
  controller.signal.throwIfAborted();
  return buildTranscriptionResponse({ text: inference.text, modelId: config.model, audioMs: evidence.durationMs,
    inferenceMs: inference.inferenceMs, totalMs: Math.round(performance.now() - started) });
}
