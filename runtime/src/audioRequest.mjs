import { randomUUID } from 'node:crypto';
import { AudioRequestError } from './errors.mjs';
import { receiveAudio, uploadBoundary } from './multipart.mjs';
import { preprocessAudio } from './preprocess.mjs';

export async function processAudioRequest(request, response, config, services) {
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
    request.destroy();
  }, 60000);
  // Abort interrupts a pending streaming read; preprocessing listens to the same signal.
  const stopReading = () => { if (!request.complete) request.destroy(); };
  controller.signal.addEventListener('abort', stopReading, { once: true });
  let files, failure;
  try {
    controller.signal.throwIfAborted();
    files = await services.temp.create();
    const upload = await receiveAudio(request, files.inputPath, boundary, config, controller.signal);
    const audio = await preprocessAudio(files, config, controller.signal, services.preprocessOptions);
    controller.signal.throwIfAborted();
    // Step 05.04 can consume this validated evidence while files still exist.
    await services.onNormalized?.({ requestId: randomUUID(), ...upload, ...audio }, controller.signal);
    controller.signal.throwIfAborted();
    throw new AudioRequestError(503, 'RUNTIME_STARTING', 'Production transcription is not connected yet.');
  } catch (error) { failure = error; } finally {
    try { await files?.remove(); } catch {
      services.cleanupFailed = true;
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
  throw failure;
}
