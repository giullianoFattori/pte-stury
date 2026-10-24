import assert from 'node:assert/strict';import test from 'node:test';
import{validateSwtForm,SWT_FORM_CONFIG}from'../src/domain/scoring/summarize-written-text/form.ts';
import{countWords}from'../src/domain/scoring/shared/writing/wordCount.ts';
import{countDetectedSentences}from'../src/domain/scoring/shared/writing/sentenceBoundaries.ts';
test('canonical word count handles whitespace, punctuation, Unicode and internal hyphens/apostrophes',()=>{
 assert.equal(countWords('  “Climate-change”\n protects  city’s green-roofs!  '),4);assert.equal(countWords('... — ?'),0);assert.equal(countWords('3.5% is 20°C.'),3);assert.equal(SWT_FORM_CONFIG.minimumWords,5);assert.equal(SWT_FORM_CONFIG.maximumWords,75);
});
test('the hard word limits are inclusive at five and seventy-five',()=>{
 assert.equal(validateSwtForm('One two three four.').formValid,false);
 assert.equal(validateSwtForm('A policy improves city transport.').formValid,true);
 assert.equal(validateSwtForm(Array.from({length:75},()=> 'word').join(' ') + '.').formValid,true);
 assert.equal(validateSwtForm(Array.from({length:76},()=> 'word').join(' ') + '.').formValid,false);
});
test('sentence boundary estimation handles decimals, abbreviations, quotes and separate sentences',()=>{
 assert.equal(countDetectedSentences('Dr. Lee measured 3.5 degrees, e.g. on Friday.'),1);
 assert.equal(countDetectedSentences('The sample was small. However, the pattern continued!'),2);
 assert.equal(countDetectedSentences('A result was recorded.”'),1);
 assert.equal(validateSwtForm('The results are useful. A second sentence follows.').singleSentence,false);
});
test('all capitals invalidates Form; capitalization, punctuation and duplicate punctuation remain diagnostics',()=>{
 const caps=validateSwtForm('URBAN TREES REDUCE HEAT AND IMPROVE HEALTH.');assert.equal(caps.allCaps,true);assert.equal(caps.formValid,false);
 const diagnostics=validateSwtForm('urban trees reduce heat and improve health.');assert.equal(diagnostics.formValid,true);assert.equal(diagnostics.startsWithCapital,false);assert.equal(diagnostics.endsWithTerminalPunctuation,true);
 assert.equal(validateSwtForm('Urban trees reduce heat and improve health').endsWithTerminalPunctuation,false);
 assert.equal(validateSwtForm('Urban trees reduce heat!!').duplicatePunctuation,true);
});
