import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, validateConfig } from '../src/config.mjs';
import { RuntimeStartupError } from '../src/errors.mjs';
import { detectBuild } from '../src/version.mjs';

const config = await loadConfig();

test('example config loads with strict loopback defaults and both allowlisted models', () => {
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.apiVersion, 1);
  assert.equal(config.maxConcurrentTranscriptions, 1);
  assert.ok(Object.isFrozen(config));
  assert.equal(validateConfig({ ...config, model: 'small.en' }).model, 'small.en');
  assert.notEqual(validateConfig(config), config);
});

test('config rejects missing/unknown keys, alternate API, unsafe hosts, models and concurrency', () => {
  const bad = [null, [], 'config', {}, { ...config, allowRemote: true }];
  for (const apiVersion of [0, 2, '1']) bad.push({ ...config, apiVersion });
  for (const host of ['0.0.0.0', 'localhost', '::1', '192.168.1.2', '', 127]) bad.push({ ...config, host });
  for (const model of ['../../bad', '/home/private/model.bin', 'tiny.en', 'https://example.com/model', '', null]) bad.push({ ...config, model });
  for (const maxConcurrentTranscriptions of [0, 2, 100, '1', null]) bad.push({ ...config, maxConcurrentTranscriptions });
  for (const key of Object.keys(config)) { const missing = { ...config }; delete missing[key]; bad.push(missing); }
  for (const value of bad) assert.throws(() => validateConfig(value), error => error instanceof RuntimeStartupError && error.code === 'INVALID_CONFIG');
});

test('config numeric limits and port reject coercion, nonfinite, fractional and unsafe values', () => {
  for (const key of ['port', 'maxUploadBytes', 'maxAudioSeconds', 'inferenceTimeoutMs']) {
    for (const value of [0, -1, 1.5, '8765', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
      assert.throws(() => validateConfig({ ...config, [key]: value }));
    }
  }
  assert.throws(() => validateConfig({ ...config, port: 65536 }));
  assert.equal(validateConfig({ ...config, port: 65535 }).port, 65535);
});

test('config file errors are bounded and do not leak filesystem paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pte-config-test-'));
  const path = join(directory, 'bad.json');
  try {
    for (const contents of ['{invalid', ' '.repeat(16385), JSON.stringify({ ...config, executablePath: '/private' })]) {
      await writeFile(path, contents);
      await assert.rejects(loadConfig(path), error => error instanceof RuntimeStartupError && !error.message.includes(directory));
    }
    await assert.rejects(loadConfig(join(directory, 'missing')), error => error.code === 'CONFIG_LOAD_FAILED' && !error.message.includes(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('platform/architecture metadata is detected and supports the contract platform identifiers', () => {
  assert.deepEqual(detectBuild(), { platform: process.platform, arch: process.arch });
  for (const platform of ['linux', 'win32', 'darwin']) {
    for (const arch of ['x64', 'arm64']) assert.deepEqual(detectBuild(platform, arch), { platform, arch });
  }
  assert.throws(() => detectBuild('unsupported', 'x64'));
  assert.throws(() => detectBuild('linux', 'unknown'));
});
