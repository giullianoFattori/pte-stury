import { prepareBank } from './pipeline.mjs';
import { reportFailure } from './build.mjs';
import { BuildError, issue } from './discover.mjs';
import { validateAudioAssets } from './audio-integrity.mjs';
import { writeFromDictationQuestions } from '../../src/data/question-bank/write-from-dictation.ts';
import { repeatSentenceQuestions } from '../../src/data/question-bank/repeat-sentence.ts';

try {
  if (process.argv.slice(2).some(arg => arg !== '--legacy') || process.argv.length > 3)
    throw new BuildError([issue('content', 'INVALID_ARGUMENTS', 'Audio report accepts only the optional --legacy flag.')]);
  const result = await prepareBank();
  let legacy;
  if (process.argv.includes('--legacy')) {
    legacy = await validateAudioAssets([...writeFromDictationQuestions, ...repeatSentenceQuestions].map(item =>
      ({ id: item.id, status: 'draft', audio: { path: item.audioUrl } })), { reportOrphans: false });
    if (legacy.errors.length) { console.log(JSON.stringify({ success: false, canonical: result.audio, legacy }, null, 2)); process.exitCode = 1; }
  }
  if (!process.exitCode) console.log(JSON.stringify({ success: true, canonical: result.audio, ...(legacy ? { legacy } : {}) }, null, 2));
} catch (error) { reportFailure(error); }
