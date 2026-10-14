// Derived diagnostic views for controlled speech tooling. Author in content/*.json only.
import { generatedQuestionBank } from './generatedQuestionBank.ts';
import { installItem } from '../../domain/content/installedContent.ts';
const items = generatedQuestionBank().bundle.items.filter(i => i.status === 'active')
  .map(i => installItem(i, '1970-01-01T00:00:00.000Z'));
export const writeFromDictationQuestions = items.filter(i => i.taskType === 'write-from-dictation');
export const repeatSentenceQuestions = items.filter(i => i.taskType === 'repeat-sentence');
export const readAloudQuestions = items.filter(i => i.taskType === 'read-aloud');
