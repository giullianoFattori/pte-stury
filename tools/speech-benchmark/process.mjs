import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { extractTranscript, WHISPER_OUTPUT_LIMIT } from '../../runtime/src/whisper.mjs';

// Direct CLI child keeps cancellation reliable. Linux VmHWM is sampled; this is
// a lower bound if the process exits between polls, never inferred from file size.
export async function measureProcess(executable, args, { timeoutMs, signal, allowEmpty = false }) {
  signal.throwIfAborted();
  const start = performance.now();
  return new Promise(resolve => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let failure, stdoutBytes = 0, stderrBytes = 0, peakRssBytes = null;
    const chunks = [];
    const stop = code => { failure ??= code; child.kill('SIGKILL'); };
    const abort = () => stop('ABORTED');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => stop('INFERENCE_TIMEOUT'), timeoutMs);
    let reading = false;
    const memory = setInterval(async () => {
      if (reading || !child.pid || process.platform !== 'linux') return;
      reading = true;
      try {
        const status = await readFile(`/proc/${child.pid}/status`, 'utf8');
        const match = /^VmHWM:\s+(\d+) kB/m.exec(status);
        if (match) peakRssBytes = Math.max(peakRssBytes ?? 0, Number(match[1]) * 1024);
      } catch { /* Process may have exited; unavailable stays null. */ }
      finally { reading = false; }
    }, 10);
    child.stdout.on('data', bytes => {
      stdoutBytes += bytes.length;
      if (stdoutBytes > WHISPER_OUTPUT_LIMIT) stop('OUTPUT_LIMIT'); else chunks.push(bytes);
    });
    child.stderr.on('data', bytes => { stderrBytes += bytes.length; if (stderrBytes > WHISPER_OUTPUT_LIMIT) stop('OUTPUT_LIMIT'); });
    child.on('error', () => { failure ??= 'PROCESS_UNAVAILABLE'; });
    child.once('close', code => {
      clearInterval(memory); clearTimeout(timer); signal.removeEventListener('abort', abort);
      const result = { inferenceMs: Math.round(performance.now() - start), peakRssBytes };
      if (failure || code !== 0) { resolve({ ...result, status: 'failed', error: failure ?? 'INFERENCE_FAILED' }); return; }
      try {
        const output = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        const transcript = allowEmpty && (!output.trim() || /^\[BLANK_AUDIO\]$/i.test(output.trim())) ? '' : extractTranscript(output);
        resolve({ ...result, status: 'ok', transcript });
      } catch (error) { resolve({ ...result, status: 'failed', error: error.code ?? 'INVALID_TRANSCRIPT' }); }
    });
  });
}
