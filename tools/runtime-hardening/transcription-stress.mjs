import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { makeFixture, post } from './fixture.mjs';
import { launch, snapshot, assertLogs } from './processes.mjs';
const fixture = await makeFixture();
let runtime;
const resources = [];
async function memoryCheckpoint() {
  const count = runtime.output().output.split('\n').filter(line => line.includes('test memory checkpoint')).length;
  runtime.child.kill('SIGUSR2');
  for (let i = 0; i < 100; i++) {
    const lines = runtime.output().output.split('\n').filter(line => line.includes('test memory checkpoint'));
    if (lines.length > count) {
      const { heapUsed, external, arrayBuffers } = JSON.parse(lines.at(-1));
      return { ...await snapshot(runtime.child.pid), heapUsed, external, arrayBuffers };
    }
    await delay(10);
  }
  throw new Error('Memory checkpoint did not complete.');
}
try {
  runtime = await launch(fixture);
  for (let i = 0; i < 20; i++) assert.equal((await post(fixture)).status, 200); // warmup JIT/allocator
  const baseline = await memoryCheckpoint();
  for (let request = 1; request <= 100; request++) {
    assert.equal((await post(fixture)).status, 200);
    assert.deepEqual(await readdir(fixture.root), ['instance.lock']);
    const nativePid = await fixture.pid(); assert.throws(() => process.kill(nativePid, 0), { code: 'ESRCH' });
    if (request % 10 === 0) {
      const measured = await memoryCheckpoint();
      assert.equal(measured.childCount, 0); assert.equal(measured.fdCount, baseline.fdCount);
      resources.push({ request, ...measured });
      console.log(JSON.stringify({ event: 'sequential stress checkpoint', request, ...measured }));
    }
  }
  assertLogs(runtime);
  await writeFile(new URL('../../runtime/docs/audits/transcription-05.08.json', import.meta.url), JSON.stringify({ controlled: true,
    realPreprocessing: true, realWhisperModel: false, sequentialRequests: 100, warmupRequests: 20,
    gc: 'Explicit GC in test-only parent at checkpoints; RSS may retain allocator high water.',
    baseline, checkpoints: resources, passed: true, memoryConclusion: 'Review measured RSS plateau/trend; no arbitrary model-RAM threshold is asserted.' }, null, 2) + '\n');
} finally { await runtime?.stop(); await fixture.remove(); }
