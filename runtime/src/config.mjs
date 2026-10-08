import { open } from 'node:fs/promises';
import { RuntimeStartupError } from './errors.mjs';

export const DEFAULT_CONFIG = new URL('../config/runtime.example.json', import.meta.url);
const KEYS = ['apiVersion', 'host', 'port', 'model', 'maxUploadBytes', 'maxAudioSeconds', 'inferenceTimeoutMs', 'maxConcurrentTranscriptions'];

export function validateConfig(value) {
  const fail = message => { throw new RuntimeStartupError('INVALID_CONFIG', message); };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('Runtime config must be a JSON object.');
  if (Object.keys(value).length !== KEYS.length || Object.keys(value).some(key => !KEYS.includes(key))
    || KEYS.some(key => !Object.hasOwn(value, key))) fail('Runtime config requires exactly the documented keys.');
  if (value.apiVersion !== 1) fail('Runtime config requires API version 1.');
  if (value.host !== '127.0.0.1') fail('Runtime config requires IPv4 loopback.');
  if (!Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535) fail('Runtime config port must be an integer from 1 to 65535.');
  if (value.model !== 'base.en' && value.model !== 'small.en') fail('Runtime config model is not allowlisted.');
  for (const key of ['maxUploadBytes', 'maxAudioSeconds', 'inferenceTimeoutMs']) {
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) fail('Runtime config limits must be positive safe integers.');
  }
  if (value.maxConcurrentTranscriptions !== 1) fail('Runtime config requires one transcription slot.');
  return Object.freeze(Object.fromEntries(KEYS.map(key => [key, value[key]])));
}

export async function loadConfig(path = DEFAULT_CONFIG) {
  let file;
  try {
    file = await open(path, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 16384) throw new RuntimeStartupError('INVALID_CONFIG', 'Runtime config must be a small regular JSON file.');
    const bytes = Buffer.alloc(16385);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const chunk = await file.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > 16384) throw new RuntimeStartupError('INVALID_CONFIG', 'Runtime config exceeds its size limit.');
    let value;
    try { value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
    catch { throw new RuntimeStartupError('INVALID_CONFIG', 'Runtime config contains invalid JSON.'); }
    return validateConfig(value);
  } catch (error) {
    if (error instanceof RuntimeStartupError) throw error;
    throw new RuntimeStartupError('CONFIG_LOAD_FAILED', 'Runtime config could not be read.');
  } finally { await file?.close(); }
}
