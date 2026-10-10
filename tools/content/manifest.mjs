import { createHash } from 'node:crypto';
import { TASK_ORDER } from './canonicalize.mjs';

export const contentVersion = bytes => 'sha256:' + createHash('sha256').update(bytes, 'utf8').digest('hex');
export function manifestFor(bundle, bytes) {
  return {
    schemaVersion: bundle.schemaVersion, contentVersion: contentVersion(bytes), itemCount: bundle.items.length,
    countsByTaskType: Object.fromEntries(TASK_ORDER.map(task => [task, bundle.items.filter(item => item.taskType === task).length])),
    audioAssetCount: new Set(bundle.items.filter(item => item.audio).map(item => item.audio.path)).size,
  };
}
export function statsFor(items) {
  return {
    totalItems: items.length,
    lifecycle: Object.fromEntries(['draft', 'active', 'retired'].map(status => [status, items.filter(item => item.status === status).length])),
    byTaskType: Object.fromEntries(TASK_ORDER.map(task => [task, items.filter(item => item.taskType === task).length])),
    byDifficulty: Object.fromEntries([1, 2, 3, 4, 5].map(difficulty => [difficulty, items.filter(item => item.difficulty === difficulty).length])),
    uniqueAudioReferences: new Set(items.filter(item => item.audio).map(item => item.audio.path)).size,
  };
}
