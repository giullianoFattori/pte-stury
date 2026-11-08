import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShortAnswer, scoreAnswerShortQuestion } from '../src/domain/scoring/answer-short-question/index.ts';
const accepted=['newspaper','newspapers'];
test('normalization handles compatibility Unicode, case, whitespace, apostrophes and terminal punctuation',()=>{
 assert.equal(normalizeShortAnswer('  ＮＥＷＳＰＡＰＥＲ.  '),'newspaper');assert.equal(normalizeShortAnswer('The newspaper!'),'newspaper');assert.equal(normalizeShortAnswer('students’ journal?'),"students' journal");
});
test('exact answers, authored variants and bounded phrase containment score one',()=>{
 for(const answer of ['newspaper','Newspaper.','newspapers',"It's newspapers that are published every day.",'The newspaper is published daily.'])assert.equal(scoreAnswerShortQuestion(answer,accepted).rawScore,1,answer);
 assert.equal(scoreAnswerShortQuestion('the red apple', ['apple']).matchedAcceptedAnswer,'apple');
});
test('matching requires complete tokens and never adds synonyms or spelling tolerance',()=>{
 for(const answer of ['article','news','magazine','new paper','newspapre'])assert.equal(scoreAnswerShortQuestion(answer,accepted).rawScore,0,answer);
 assert.equal(scoreAnswerShortQuestion('art', ['art']).correct,true);assert.equal(scoreAnswerShortQuestion('article', ['art']).correct,false);
});
test('no response is zero; overlong is a diagnostic without changing clear correctness',()=>{
 const empty=scoreAnswerShortQuestion('',accepted);assert.equal(empty.rawScore,0);assert.equal(empty.responseWordCount,0);
 const long=scoreAnswerShortQuestion('I think that the correct answer is definitely newspaper because it comes each morning today',accepted);assert.equal(long.correct,true);assert.equal(long.overlongResponse,true);
});
