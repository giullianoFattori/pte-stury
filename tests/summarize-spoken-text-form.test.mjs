import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSstForm } from '../src/domain/scoring/summarize-spoken-text/form.ts';
const words=n=>Array.from({length:n},(_,i)=>`word${i}`).join(' ')+'.';
for(const[n,points]of [[39,0],[40,1],[49,1],[50,2],[70,2],[71,1],[100,1],[101,0]])test(`SST Form band at ${n} words`,()=>assert.equal(validateSstForm(words(n)).formPoints,points));
test('structural zero rules override length bands',()=>{
 assert.equal(validateSstForm(words(50).toUpperCase()).zeroFormReason,'all-caps');
 assert.equal(validateSstForm(words(50).replace('.','')).zeroFormReason,'no-punctuation');
 assert.equal(validateSstForm(Array.from({length:50},(_,i)=>`- word${i}.`).join('\n')).zeroFormReason,'bullet-like');
 const shortSentences=Array.from({length:8},()=> 'We learn these useful ideas.').join(' ');
 assert.equal(validateSstForm(shortSentences).zeroFormReason,'very-short-sentences');
});
test('decimal and abbreviation periods do not create false sentences',()=>{const result=validateSstForm('Dr. Lee observed a 2.5 percent change across many regions and reported that the long-term pattern remained stable throughout the entire study period.');assert.equal(result.sentenceCount,1);});
