import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateRetellLectureCoverage, RETELL_LECTURE_MATCH_CONFIG } from '../src/domain/scoring/retell-lecture.ts';
const data={keyPoints:['Urban trees reduce local temperatures','They provide shade for pedestrians','Cooling lowers energy demand'],keywords:['urban trees','shade','energy demand']};
test('key-point coverage accepts case, punctuation and paraphrase-like anchor order without transcript matching',()=>{
 const r=calculateRetellLectureCoverage('LOCAL temperatures are reduced by urban trees. They provide shade to pedestrians!',data);
 assert.equal(r.matchedKeyPoints,2);assert.equal(r.totalKeyPoints,3);assert.equal(r.keyPointCoverage,2/3);assert.deepEqual(r.matches[0].matchedTerms,['urban','trees','local','temperatures']);
});
test('explicit threshold rejects weak overlap, irrelevant/empty text and stopword-only matches',()=>{
 assert.deepEqual(RETELL_LECTURE_MATCH_CONFIG,{minimumAnchors:2,requiredFraction:.6,longPauseMs:500});
 for(const response of ['urban the and','students study science',''])assert.equal(calculateRetellLectureCoverage(response,data).keyPointCoverage,0);
 assert.equal(calculateRetellLectureCoverage('urban trees are nearby',data).matchedKeyPoints,0);
});
test('duplicate response terms cannot inflate anchors and repeated unique points do not inflate coverage',()=>{
 assert.equal(calculateRetellLectureCoverage('urban urban urban trees trees',data).matchedKeyPoints,0);
 assert.equal(calculateRetellLectureCoverage('urban trees reduce local temperatures temperatures',data).matchedKeyPoints,1);
});
test('optional keywords are secondary diagnostics and cannot replace point coverage',()=>{
 const noKeywords=calculateRetellLectureCoverage('shade urban trees energy demand', {keyPoints:data.keyPoints});
 const withKeywords=calculateRetellLectureCoverage('shade urban trees energy demand',data);
 assert.equal(noKeywords.keywordCoverage,0);assert.ok(withKeywords.keywordCoverage>0);assert.equal(withKeywords.keyPointCoverage,0);
});
