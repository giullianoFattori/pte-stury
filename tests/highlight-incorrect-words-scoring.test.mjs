import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreHighlightIncorrectWords } from '../src/domain/scoring/highlight-incorrect-words/index.ts';

const tokens=[{id:'a',text:'seasonal',incorrect:true,spokenText:'thermal'},{id:'b',text:'measurements',incorrect:false},{id:'c',text:'charging',incorrect:true,spokenText:'changing'}];
test('HIW applies exact +1 / -1, a zero floor, and normalized score',()=>{
 const result=scoreHighlightIncorrectWords(tokens,['a','b']);assert.equal(result.rawScore,0);assert.equal(result.score,0);assert.equal(result.maxScore,2);assert.equal(result.correctSelections,1);assert.equal(result.incorrectSelections,1);assert.equal(result.missedIncorrectWords,1);assert.equal(result.precision,.5);assert.equal(result.recall,.5);
 const positive=scoreHighlightIncorrectWords(tokens,['a','c','b']);assert.equal(positive.rawScore,1);assert.equal(positive.score,.5);assert.deepEqual(positive.falsePositiveTokenIds,['b']);
});
test('HIW selection identity is stable token ID and rejects unknown/duplicate IDs or bad authored truth',()=>{
 assert.throws(()=>scoreHighlightIncorrectWords(tokens,['missing']));assert.throws(()=>scoreHighlightIncorrectWords(tokens,['a','a']));assert.throws(()=>scoreHighlightIncorrectWords([{...tokens[0]},{...tokens[0]}],[]));assert.throws(()=>scoreHighlightIncorrectWords([{id:'a',text:'word',incorrect:false}],[]));
});
