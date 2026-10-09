import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
import { makeFixture, post } from './fixture.mjs';
import { launch, snapshot, assertLogs } from './processes.mjs';
const fixture = await makeFixture();
const results = [];
let runtime;
try {
  for (let cycle = 1; cycle <= 20; cycle++) {
    runtime = await launch(fixture);
    assert.equal((await post(fixture)).status, 200);
    const nativePid = await fixture.pid();
    assert.throws(() => process.kill(nativePid, 0), { code: 'ESRCH' });
    const resources = await snapshot(runtime.child.pid);
    assert.equal(resources.childCount, 0);
    assert.deepEqual(await readdir(fixture.root), ['instance.lock']);
    assert.deepEqual(await runtime.stop(), { code: 0, signal: null });
    assert.deepEqual(await readdir(fixture.root), []); assertLogs(runtime);
    results.push({ cycle, ...resources, tempEntriesAfterStop: 0, nativeChildAlive: false });
    console.log(JSON.stringify({ event: 'restart cycle passed', cycle }));
  }
  await writeFile(new URL('../../runtime/docs/audits/restart-05.08.json', import.meta.url), JSON.stringify({ controlled: true,
    realPreprocessing: true, realWhisperModel: false, cycles: results, passed: true }, null, 2) + '\n');
} finally { await runtime?.stop(); await fixture.remove(); }
