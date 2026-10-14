// Frozen historical migration baseline; never imported by the learner app.
import { readFileSync } from 'node:fs';
const items = JSON.parse(readFileSync(new URL('../fixtures/content-migration/legacy-bank.json', import.meta.url), 'utf8'));
export const writeFromDictationQuestions = items.filter(i => i.taskType === 'write-from-dictation');
export const repeatSentenceQuestions = items.filter(i => i.taskType === 'repeat-sentence');
export const readAloudQuestions = items.filter(i => i.taskType === 'read-aloud');
