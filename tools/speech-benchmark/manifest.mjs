import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { tokenizeText } from '../../src/domain/scoring/shared/tokenizeText.ts';

export function validateManifest(value) {
  if (value?.manifestVersion !== 1 || !Array.isArray(value.samples)) throw new Error('Expected manifestVersion 1 and samples array.');
  const ids = new Set();
  for (const sample of value.samples) {
    if (!/^(ra|rs|noise)-[a-z0-9-]+$/.test(sample.id ?? '') || ids.has(sample.id)) throw new Error('Invalid or duplicate sample ID.');
    ids.add(sample.id);
    if (!['ra', 'rs', 'noise'].includes(sample.task) || !sample.id.startsWith(`${sample.task}-`)) throw new Error('Unsupported task or ID/task mismatch.');
    if (typeof sample.audioFile !== 'string' || !sample.audioFile || isAbsolute(sample.audioFile)
      || sample.audioFile.split(/[\\/]/).some(part => !part || part === '..') || sample.audioFile.includes('\\')) throw new Error('Audio must have a relative corpus path.');
    if (typeof sample.expectedText !== 'string' || typeof sample.spokenReference !== 'string') throw new Error('Separate expectedText and spokenReference required.');
    if (sample.usable !== false && sample.task !== 'noise' && (!sample.expectedText.trim() || !sample.spokenReference.trim()
      || sample.source !== 'human' || sample.referenceVerified !== true)) throw new Error('Usable speech needs human audio and a manually verified reference.');
    if (sample.usable === false && !sample.exclusionReason?.trim()) throw new Error('Excluded sample requires a reason.');
    if (sample.task === 'noise' && (sample.expectedText !== '' || sample.spokenReference !== ''
      || !['digital-silence', 'room-noise', 'hiss', 'breathing'].includes(sample.noiseType))) throw new Error('Noise samples require empty references and a noiseType.');
    if (sample.task !== 'noise' && (!/^speaker-[0-9]+$/.test(sample.notes?.speaker ?? '')
      || !['pt-BR', 'other'].includes(sample.notes?.l1)
      || !['quiet-room', 'normal-room', 'noisy-room'].includes(sample.notes?.environment)
      || !['slow', 'normal', 'fast', 'varying'].includes(sample.notes?.pace))) throw new Error('Anonymized speaker, L1, environment and pace required.');
    if (sample.usable !== false && sample.task !== 'noise' && (!tokenizeText(sample.spokenReference).length
      || tokenizeText(sample.spokenReference).length > 2000)) throw new Error('Reference must contain 1–2000 words.');
  }
  return value;
}

export async function loadManifest(path, corpusRoot) {
  const manifest = validateManifest(JSON.parse(await readFile(path, 'utf8')));
  const root = await realpath(corpusRoot);
  for (const sample of manifest.samples) {
    if (sample.usable === false) continue;
    let audio;
    try { audio = await realpath(resolve(root, sample.audioFile)); }
    catch { throw new Error(`Missing audio for ${sample.id}.`); }
    const rel = relative(root, audio);
    if (rel.startsWith('..') || isAbsolute(rel) || !(await stat(audio)).isFile()) throw new Error(`Invalid audio for ${sample.id}.`);
  }
  return manifest;
}
