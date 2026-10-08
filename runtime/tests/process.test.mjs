import assert from 'node:assert/strict';
import test from 'node:test';
import { connect } from 'node:net';
import { once } from 'node:events';
import { loadConfig } from '../src/config.mjs';
import { freePort, launchRuntime } from './helpers.mjs';

const defaults = await loadConfig();

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} closes active/partial connections, exits cleanly and permits immediate restart`, { timeout: 12000 }, async context => {
    const config = { ...defaults, port: await freePort() };
    const runtime = await launchRuntime(config, context);
    await runtime.ready();
    const response = await fetch(`http://127.0.0.1:${config.port}/api/v1/health`);
    assert.equal(response.status, 200);
    await response.json();
    const socket = connect(config.port, '127.0.0.1');
    socket.on('error', () => {});
    context.after(() => socket.destroy());
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    socket.write('GET /api/v1/health HTTP/1.1\r\nHost:');
    runtime.child.kill(signal);
    assert.deepEqual(await runtime.exited, { code: 0, signal: null });
    await closed;
    assert.match(runtime.output().stdout, /shutdown started/);
    assert.match(runtime.output().stdout, /shutdown complete/);
    assert.equal(runtime.output().stderr, '');
    const restarted = await launchRuntime(config, context);
    await restarted.ready();
    const version = await fetch(`http://127.0.0.1:${config.port}/api/v1/version`);
    assert.equal(version.status, 200);
    await version.json();
    restarted.child.kill('SIGTERM');
    assert.deepEqual(await restarted.exited, { code: 0, signal: null });
  });
}

test('port collision fails non-zero without changing port or stopping the first runtime', { timeout: 10000 }, async context => {
  const config = { ...defaults, port: await freePort() };
  const first = await launchRuntime(config, context);
  await first.ready();
  const second = await launchRuntime(config, context);
  assert.equal((await second.exited).code, 1);
  assert.match(second.output().stderr, /PORT_IN_USE/);
  assert.doesNotMatch(second.output().stdout, /listener bound/);
  assert.equal((await fetch(`http://127.0.0.1:${config.port}/api/v1/health`)).status, 200);
});

test('invalid configuration refuses startup without echoing private config values or paths', async context => {
  for (const change of [{ host: '0.0.0.0' }, { model: '../../private-recording' }, { maxConcurrentTranscriptions: 100 }, { allowRemote: true }]) {
    const runtime = await launchRuntime({ ...defaults, ...change }, context);
    assert.equal((await runtime.exited).code, 1);
    const output = runtime.output();
    assert.match(output.stderr, /INVALID_CONFIG/);
    assert.doesNotMatch(output.stderr, /private-recording|allowRemote/);
    assert.ok(!output.stderr.includes(runtime.directory));
    assert.doesNotMatch(output.stdout, /listener bound/);
  }
});
