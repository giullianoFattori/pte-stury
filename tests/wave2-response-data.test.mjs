import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAttemptResponseData } from '../src/domain/pte/validateAttemptResponseData.ts';
const attempt = (taskType,responseData) => ({ id: 'a1', itemId: `${taskType}-000001`, taskType, createdAt: '2026-10-01T00:00:00Z', responseData });

test('typed response kinds validate against their task families', () => {
  const cases = [
    ['highlight-incorrect-words',{kind:'token-selection',selectedTokenIds:['tok-1']}],
    ['reading-multiple-choice-single',{kind:'single-choice',selectedOptionId:'option-1'}],
    ['listening-multiple-choice-single',{kind:'single-choice'}],
    ['reading-multiple-choice-multiple',{kind:'multiple-choice',selectedOptionIds:['a','b']}],
    ['listening-fill-blanks-type-in',{kind:'blank-text',answers:{blank_1:'answer'}}],
    ['reading-fill-blanks-dropdown',{kind:'blank-choice',answers:{blank_1:'option_1'}}],
    ['reading-fill-blanks-drag-drop',{kind:'blank-choice',answers:{blank_1:'word_1'}}],
    ['reorder-paragraph',{kind:'ordered-blocks',blockIds:['p1','p2']}],
    ['highlight-correct-summary',{kind:'single-choice',selectedOptionId:'summary-1'}],
    ['select-missing-word',{kind:'single-choice',selectedOptionId:'word-1'}],
  ];
  for (const [task,response] of cases) assert.doesNotThrow(() => validateAttemptResponseData(attempt(task,response)));
});

test('historical HIW responseData without a kind remains valid', () => {
  assert.doesNotThrow(() => validateAttemptResponseData(attempt('highlight-incorrect-words', {
    selectedTokenIds:['t1'],correctTokenIds:['t1'],falsePositiveTokenIds:[],missedTokenIds:['t2'],
  })));
});

test('response payload rejects wrong task, duplicates, malformed maps and unknown fields', () => {
  for (const [task,response] of [
    ['answer-short-question',{kind:'single-choice',selectedOptionId:'x'}],
    ['reading-multiple-choice-single',{kind:'multiple-choice',selectedOptionIds:['x']}],
    ['reading-multiple-choice-multiple',{kind:'multiple-choice',selectedOptionIds:['x','x']}],
    ['listening-fill-blanks-type-in',{kind:'blank-text',answers:{'bad id':'x'}}],
    ['reorder-paragraph',{kind:'ordered-blocks',blockIds:['p1','p1']}],
    ['reading-multiple-choice-single',{kind:'single-choice',selectedOptionId:'x',extra:true}],
    ['highlight-incorrect-words',{selectedTokenIds:['t1'],correctTokenIds:['t2'],falsePositiveTokenIds:[],missedTokenIds:[]}],
    ['read-aloud',{kind:'single-choice'}],
  ]) assert.throws(() => validateAttemptResponseData(attempt(task,response)));
});

test('absence remains valid for historical Attempts', () => {
  assert.doesNotThrow(() => validateAttemptResponseData(attempt('read-aloud',undefined)));
});
