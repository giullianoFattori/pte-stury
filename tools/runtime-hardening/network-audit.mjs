// Linux syscall instrumentation of actual decoders; not OS sandbox enforcement.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNative } from '../../runtime/src/nativeProcess.mjs';
import { inputArguments } from '../../runtime/src/media.mjs';
const base = await mkdtemp(join(tmpdir(), 'pte-network-audit-'));
const findings = [];
try {
  for (const tool of ['/usr/bin/ffprobe', '/usr/bin/ffmpeg']) {
    for (const protocol of ['http', 'https', 'tcp', 'udp']) {
      const trace = join(base, 'trace');
      const input = `${protocol}://127.0.0.1:9/audio.wav`;
      let denied = false;
      try {
        await runNative('/usr/bin/strace', ['-f', '-e', 'trace=connect,sendto,sendmsg', '-o', trace, tool,
          '-v', 'error', ...inputArguments('wav', input), ...(tool.endsWith('ffmpeg') ? ['-f', 'null', '-'] : ['-of', 'json'])],
        { signal: new AbortController().signal, timeoutMs: 3000,
          unavailable: () => new Error('strace/tool unavailable'), failed: () => new Error('decoder denied input'), timeout: () => new Error('network audit timeout') });
      } catch { denied = true; }
      assert.equal(denied, true);
      const text = await readFile(trace, 'utf8');
      assert.match(text, /exited with [1-9][0-9]*/); // Actual decoder ran and rejected input.
      assert.doesNotMatch(text, /connect\([^\n]*AF_INET|send(?:to|msg)\([^\n]*AF_INET/);
      findings.push({ tool: tool.split('/').at(-1), protocol, denied: true, inetOutboundSyscalls: 0 });
    }
  }
  await writeFile(new URL('../../runtime/docs/audits/network-05.08.json', import.meta.url), JSON.stringify({ platform: 'linux',
    instrumentation: 'strace -f connect/sendto/sendmsg on real native ffprobe/ffmpeg; fixed production protocol/demuxer arguments',
    limitation: 'Protocol restrictions, not an OS sandbox or proof against malicious/exploited decoder code.', findings, passed: true }, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'native network audit passed', cases: findings.length }));
} finally { await rm(base, { recursive: true, force: true }); }
