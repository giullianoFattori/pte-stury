import assert from 'node:assert/strict';
import test from 'node:test';
import { TASK_DATA_RULES } from '../src/domain/content/taskDataPolicy.ts';
import { parseTaskData, readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { parseQuestionBankItem } from '../src/domain/content/validation.ts';
import { TASK_REGISTRY, WAVE2_TASKS } from '../src/domain/pte/taskRegistry.ts';

const audio = { path: '/audio/wave2/technical.mp3', sha256: 'a'.repeat(64), durationMs: 20_000, mimeType: 'audio/mpeg' };
const options = [{ id: 'a', text: 'First answer', correct: true }, { id: 'b', text: 'Second answer', correct: false }, { id: 'c', text: 'Third answer', correct: true }];
const single = [{ id: 'a', text: 'First answer', correct: true }, { id: 'b', text: 'Second answer', correct: false }];
const fixtures = {
  'answer-short-question': { audio: { ...audio, durationMs: 4000 }, questionTranscript: 'Which planet is known as the Red Planet?', acceptedAnswers: ['Mars'] },
  'respond-to-a-situation': { audio, promptText: 'You need to ask a lecturer for an extension.', scenario: { role: 'student', audience: 'lecturer', relationship: 'student and lecturer', communicationGoal: 'request an extension', register: 'formal' }, requiredPoints: ['explain the reason','state the requested date'] },
  'write-essay': { prompt: 'Should cities invest more in public transport?', positionType: 'agree-disagree', keyRequirements: ['state a position','support it with reasons'] },
  'reading-fill-blanks-dropdown': { segments: ['The study was ', ' over three years.'], blanks: [{ id: 'blank-1', answer: 'conducted', options: ['conducted','conducting'] }] },
  'reading-multiple-choice-multiple': { passage: 'Research passage.', question: 'Which claims are supported?', options },
  'reorder-paragraph': { blocks: [{ id: 'p1', text: 'Opening.' },{ id: 'p2', text: 'Development.' },{ id: 'p3', text: 'Conclusion.' }], correctOrder: ['p1','p2','p3'] },
  'reading-fill-blanks-drag-drop': { segments: ['A ', ' affects climate.'], blanks: [{ id: 'blank-1', answer: 'forest' }], wordBank: ['forest','ocean','desert'] },
  'reading-multiple-choice-single': { passage: 'Research passage.', question: 'What is the main finding?', options: single },
  'listening-multiple-choice-multiple': { audio, transcript: 'A short lecture transcript.', question: 'Which points were mentioned?', options },
  'listening-fill-blanks-type-in': { audio: { ...audio, durationMs: 30_000 }, transcriptSegments: ['The project began in ', '.'], blanks: [{ id: 'year', answer: '2024' }] },
  'highlight-correct-summary': { audio, transcript: 'A short lecture transcript.', options: single },
  'listening-multiple-choice-single': { audio, transcript: 'A short lecture transcript.', question: 'What did the speaker recommend?', options: single },
  'select-missing-word': { audio, transcriptBeforeBeep: 'The evidence was carefully', missingText: 'reviewed', options: [{ id: 'a', text: 'reviewed', correct: true },{ id: 'b', text: 'removed', correct: false }] },
};
const itemFor = task => ({ id: `${TASK_REGISTRY[task].idPrefix}-900001`, taskType: task, difficulty: 2, prompt: 'Technical contract fixture.', revision: 1, status: 'draft', source: 'generated', taskData: structuredClone(fixtures[task]) });
const rejects = (task, payload) => assert.throws(() => parseTaskData(task, payload, false));

test('all thirteen additive Wave 2 taskData fixtures validate and are read through the authoritative parser', () => {
  assert.deepEqual(Object.keys(fixtures).sort(), [...WAVE2_TASKS].sort());
  assert.deepEqual(Object.keys(TASK_DATA_RULES).filter(task => WAVE2_TASKS.includes(task)).sort(), [...WAVE2_TASKS].sort());
  for (const task of WAVE2_TASKS) {
    const fixture = itemFor(task);
    assert.deepEqual(parseQuestionBankItem(fixture), fixture);
    assert.deepEqual(readTaskData(fixture, task), fixture.taskData);
  }
});

test('Wave 2 payload validators reject missing, malformed and unknown fields', () => {
  for (const task of WAVE2_TASKS) {
    const payload = structuredClone(fixtures[task]);
    const required = TASK_DATA_RULES[task].required;
    assert.ok(required.length, `${task} must declare required fields`);
    const missing = structuredClone(payload); delete missing[required[0]]; rejects(task, missing);
    rejects(task, null); rejects(task, { ...payload, unknownField: true });
  }
});

test('choice cardinality and stable option identity are task-specific', () => {
  rejects('reading-multiple-choice-multiple', { ...fixtures['reading-multiple-choice-multiple'], options: single });
  rejects('listening-multiple-choice-multiple', { ...fixtures['listening-multiple-choice-multiple'], options: single });
  for (const task of ['reading-multiple-choice-single','listening-multiple-choice-single','highlight-correct-summary','select-missing-word']) {
    rejects(task, { ...fixtures[task], options });
    rejects(task, { ...fixtures[task], options: [{ ...single[0], id: 'same' },{ ...single[1], id: 'same' }] });
  }
  rejects('select-missing-word', { ...fixtures['select-missing-word'], missingText: 'unknown' });
});

test('blank structures and reorder permutations must be coherent', () => {
  rejects('reading-fill-blanks-dropdown', { ...fixtures['reading-fill-blanks-dropdown'], segments: ['only one'] });
  rejects('reading-fill-blanks-dropdown', { ...fixtures['reading-fill-blanks-dropdown'], blanks: [{ id: 'x', answer: 'absent', options: ['other','choice'] }] });
  rejects('reading-fill-blanks-drag-drop', { ...fixtures['reading-fill-blanks-drag-drop'], wordBank: ['other'] });
  rejects('listening-fill-blanks-type-in', { ...fixtures['listening-fill-blanks-type-in'], transcriptSegments: ['no blank coherence'] });
  rejects('reorder-paragraph', { ...fixtures['reorder-paragraph'], correctOrder: ['p1','p1','p3'] });
  rejects('reorder-paragraph', { ...fixtures['reorder-paragraph'], blocks: [{ id: 'p1', text: 'A' },{ id: 'p1', text: 'B' },{ id: 'p3', text: 'C' }] });
});

test('optional ASQ image and alt text must appear together', () => {
  const image = { path: '/images/wave2/example.png', sha256: 'b'.repeat(64), bytes: 12, mediaType: 'image/png', width: 2, height: 2 };
  rejects('answer-short-question', { ...fixtures['answer-short-question'], image });
  rejects('answer-short-question', { ...fixtures['answer-short-question'], imageAlt: 'A diagram' });
  assert.doesNotThrow(() => parseTaskData('answer-short-question', { ...fixtures['answer-short-question'], image, imageAlt: 'A simple labelled diagram' }, false));
});
