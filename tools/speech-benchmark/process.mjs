import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { extractTranscript } from '../../runtime/src/whisper.mjs';
import { runNative } from '../../runtime/src/nativeProcess.mjs';

// Same process environment/termination policy as production; Linux VmHWM is a
// sampled lower bound. Model-load cost remains in the measured launch-to-close time.
export async function measureProcess(executable, args, { timeoutMs, signal, allowEmpty = false }) {
  signal.throwIfAborted();
  const start = performance.now();
  let peakRssBytes = null, memory, reading = false;
  const error = code => Object.assign(new Error(code), { code });
  try {
    const output = await runNative(executable, args, { signal, timeoutMs,
      unavailable: () => error('PROCESS_UNAVAILABLE'), failed: () => error('INFERENCE_FAILED'),
      timeout: () => error('INFERENCE_TIMEOUT'),
      onSpawn(pid) {
        if (!pid || process.platform !== 'linux') return;
        memory = setInterval(async () => {
          if (reading) return;
          reading = true;
          try {
            const status = await readFile(`/proc/${pid}/status`, 'utf8');
            const match = /^VmHWM:\s+(\d+) kB/m.exec(status);
            if (match) peakRssBytes = Math.max(peakRssBytes ?? 0, Number(match[1]) * 1024);
          } catch { /* Exited process; unavailable stays null. */ }
          finally { reading = false; }
        }, 10);
      } });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(output);
    const transcript = allowEmpty && (!text.trim() || /^\[BLANK_AUDIO\]$/i.test(text.trim())) ? '' : extractTranscript(text);
    return { status: 'ok', transcript, inferenceMs: Math.round(performance.now() - start), peakRssBytes };
  } catch (failure) {
    return { status: 'failed', error: signal.aborted ? 'ABORTED' : failure.code ?? 'INVALID_TRANSCRIPT',
      inferenceMs: Math.round(performance.now() - start), peakRssBytes };
  } finally { clearInterval(memory); }
}
