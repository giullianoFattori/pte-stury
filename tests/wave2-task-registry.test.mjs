import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICIAL_PTE_TASK_ORDER, IMPLEMENTATION_TASK_ORDER, PRACTICE_TASK_ORDER, QUICK_TASK_POOL, FOUNDATION_TASKS, WAVE1_TASKS, WAVE2_TASKS, TASK_REGISTRY, TASK_ID_PREFIXES } from '../src/domain/pte/taskRegistry.ts';
import { PTE_SPEC_VERSION } from '../src/domain/pte/spec.ts';
import { validateBuildRequest } from '../src/domain/study-session/buildRequest.ts';
import { prepareStudySession } from '../src/application/study-session/prepareStudySession.ts';
import { SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';

test('catalogue freezes 22 unique scored task identities and excludes Personal Introduction', () => {
  assert.equal(OFFICIAL_PTE_TASK_ORDER.length, 22);
  assert.equal(new Set(OFFICIAL_PTE_TASK_ORDER).size, 22);
  assert.deepEqual([...OFFICIAL_PTE_TASK_ORDER].sort(), [...IMPLEMENTATION_TASK_ORDER].sort());
  assert.equal(OFFICIAL_PTE_TASK_ORDER.includes('personal-introduction'), false);
  assert.equal(IMPLEMENTATION_TASK_ORDER.length, 22);
  assert.equal(new Set(Object.values(TASK_ID_PREFIXES)).size, 22);
  assert.equal(PTE_SPEC_VERSION, '2026-10-01');
});

test('Wave 2 membership, readiness, selectors and Quick policy remain explicit', () => {
  assert.deepEqual(WAVE2_TASKS, ['listening-fill-blanks-type-in','reading-fill-blanks-dropdown','reading-fill-blanks-drag-drop','reorder-paragraph','respond-to-a-situation','write-essay','answer-short-question','reading-multiple-choice-multiple','listening-multiple-choice-multiple','reading-multiple-choice-single','listening-multiple-choice-single','highlight-correct-summary','select-missing-word']);
  assert.equal(WAVE2_TASKS.length, 13);
  assert.deepEqual(PRACTICE_TASK_ORDER, [...FOUNDATION_TASKS, ...WAVE1_TASKS]);
  assert.deepEqual(QUICK_TASK_POOL, FOUNDATION_TASKS);
  assert.deepEqual(validateBuildRequest({ mode: 'quick' }).taskTypes, FOUNDATION_TASKS);
  for (const task of WAVE2_TASKS) {
    assert.equal(TASK_REGISTRY[task].wave, 'wave-2');
    assert.equal(TASK_REGISTRY[task].practiceReady, false);
    assert.ok(TASK_REGISTRY[task].label);
  }
  assert.equal(SESSION_SUMMARY_TASKS.length, 9);
});

test('Wave 2 skill mappings distinguish section membership from communicative skills', () => {
  const expected = {
    'answer-short-question': ['listening'], 'respond-to-a-situation': ['speaking'], 'write-essay': ['writing'],
    'reading-fill-blanks-dropdown': ['reading'], 'reading-multiple-choice-multiple': ['reading'], 'reorder-paragraph': ['reading'],
    'reading-fill-blanks-drag-drop': ['reading'], 'reading-multiple-choice-single': ['reading'],
    'listening-multiple-choice-multiple': ['listening'], 'listening-fill-blanks-type-in': ['listening','writing'],
    'highlight-correct-summary': ['listening','reading'], 'listening-multiple-choice-single': ['listening'], 'select-missing-word': ['listening'],
  };
  const sections = {
    'answer-short-question':'speaking-writing','respond-to-a-situation':'speaking-writing','write-essay':'speaking-writing',
    'reading-fill-blanks-dropdown':'reading','reading-multiple-choice-multiple':'reading','reorder-paragraph':'reading',
    'reading-fill-blanks-drag-drop':'reading','reading-multiple-choice-single':'reading',
    'listening-multiple-choice-multiple':'listening','listening-fill-blanks-type-in':'listening','highlight-correct-summary':'listening',
    'listening-multiple-choice-single':'listening','select-missing-word':'listening',
  };
  for (const task of WAVE2_TASKS) { assert.deepEqual(TASK_REGISTRY[task].skills, expected[task]); assert.equal(TASK_REGISTRY[task].section, sections[task]); }
  assert.deepEqual(WAVE2_TASKS.map(task => TASK_REGISTRY[task].idPrefix), ['lfb','rfbd','rfbdd','rop','rts','we','asq','rmcm','lmcm','rmcs','lmcs','hcs','smw']);
});

test('unready catalogue tasks fail before session dependencies or content queries run', async () => {
  for (const task of WAVE2_TASKS) await assert.rejects(prepareStudySession({ mode: 'task', itemCount: 1, taskTypes: [task] }, {
    source: { queryPracticeItems: () => assert.fail('unready task queried') }, idGenerator: () => assert.fail('id generated'), now: () => assert.fail('clock read'), rng: () => assert.fail('rng used'),
  }), error => error.code === 'INVALID_SESSION_CONFIG');
});
