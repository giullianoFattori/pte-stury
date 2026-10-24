import assert from 'node:assert/strict';import test from 'node:test';
import{calculateSummarizeWrittenTextCoverage}from'../src/domain/scoring/summarize-written-text/content.ts';
import{detectSourceCopy,COPY_DETECTION_CONFIG}from'../src/domain/scoring/shared/writing/copyDetection.ts';
const data={keyPoints:['Urban trees lower street temperatures','Green roofs reduce energy demand','Shade protects public health']};
test('authored key points produce deterministic partial coverage without a reference answer',()=>{
 const result=calculateSummarizeWrittenTextCoverage('Urban trees lower street temperatures and green roofs reduce energy demand.',data);
 assert.equal(result.matchedKeyPoints,2);assert.equal(result.totalKeyPoints,3);assert.equal(result.keyPointCoverage,2/3);assert.equal(result.responseWordCount,11);assert.equal(result.matches[2].matched,false);
});
test('empty, irrelevant and repeated responses do not inflate key-point coverage',()=>{
 assert.equal(calculateSummarizeWrittenTextCoverage('',data).keyPointCoverage,0);
 assert.equal(calculateSummarizeWrittenTextCoverage('The university opened a new laboratory for students.',data).keyPointCoverage,0);
 assert.equal(calculateSummarizeWrittenTextCoverage('trees trees trees trees trees trees trees trees',data).keyPointCoverage,0);
});
test('copy diagnostics ignore short overlap and recognize contiguous copied runs',()=>{
 const passage='Researchers found that urban trees lower street temperatures during hot summer days.';
 assert.equal(detectSourceCopy('Urban trees lower temperatures.',passage).longestCopiedRunWords,0);
 const copied=detectSourceCopy('Researchers found that urban trees lower street temperatures during hot summer days.',passage);
 assert.equal(copied.longestCopiedRunWords,12);assert.equal(copied.sourceCopyRatio,1);assert.equal(copied.sourceCopyPercent,100);assert.equal(COPY_DETECTION_CONFIG.minimumCopiedRunWords,4);
});
test('repeated copied wording is measured per response token and paraphrased wording avoids long runs',()=>{
 const passage='Researchers found that urban trees lower street temperatures during hot summer days.';
 const repeated=detectSourceCopy('Researchers found that urban trees. Researchers found that urban trees.',passage);assert.equal(repeated.sourceCopyRatio,1);assert.equal(repeated.longestCopiedRunWords,5);
 const paraphrase=detectSourceCopy('Vegetation cools neighbourhood roads and can reduce demand for indoor cooling.',passage);assert.equal(paraphrase.sourceCopyRatio,0);assert.equal(paraphrase.longestCopiedRunWords,0);
});
