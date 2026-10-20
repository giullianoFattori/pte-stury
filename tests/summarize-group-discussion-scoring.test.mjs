import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSummarizeGroupDiscussionCoverage } from '../src/domain/scoring/summarize-group-discussion.ts';

const data={speakers:[{id:'a',label:'Speaker A'},{id:'b',label:'Speaker B'},{id:'c',label:'Speaker C'}],turns:[{speakerId:'a',text:'A'},{speakerId:'b',text:'B'},{speakerId:'c',text:'C'}],
 keyPoints:['climate models predict regional rainfall changes','urban trees lower street temperatures'],
 speakerPoints:[{speakerId:'a',points:['scientists update climate models using regional rainfall data']},{speakerId:'b',points:['farmers report local rainfall shortages']},{speakerId:'c',points:['city trees lower street temperature']}],
 relationships:['the second speaker challenges the first speaker rainfall forecast']};
const all='Scientists update climate models using regional rainfall data. Farmers report local rainfall shortages. City trees lower street temperature. The second speaker challenges the first speaker rainfall forecast.';
test('covers key points, all three authored speaker contributions and an authored relationship',()=>{
 const result=calculateSummarizeGroupDiscussionCoverage(all,data);assert.equal(result.keyPointCoverage,1);assert.equal(result.matchedKeyPoints,2);assert.equal(result.speakerCoverage,1);assert.equal(result.representedSpeakers,3);assert.equal(result.relationshipCoverage,1);assert.equal(result.matchedRelationships,1);
});
test('one speaker cannot gain additional speaker coverage from repeated matched words',()=>{
 const result=calculateSummarizeGroupDiscussionCoverage('Scientists update climate models using regional rainfall data. Climate climate models climate models.',data);
 assert.equal(result.speakerCoverage,1/3);assert.equal(result.representedSpeakers,1);
});
test('partial lexical thresholds, punctuation and case are deterministic',()=>{
 assert.equal(calculateSummarizeGroupDiscussionCoverage('CLIMATE, models; predict regional rainfall changes!',data).matchedKeyPoints,1);
 assert.equal(calculateSummarizeGroupDiscussionCoverage('climate models regional',data).keyPointMatches[0].matched,false);
});
test('irrelevant, empty and stopword-only responses cover no content or speakers',()=>{
 for(const text of ['', 'and the is with that on', 'unrelated response about bananas']){const result=calculateSummarizeGroupDiscussionCoverage(text,data);assert.equal(result.keyPointCoverage,0);assert.equal(result.speakerCoverage,0);assert.equal(result.relationshipCoverage,0);}
});
test('relationship metrics are omitted when no relationships are authored',()=>{
 const noRelationships={...data};delete noRelationships.relationships;const result=calculateSummarizeGroupDiscussionCoverage(all,noRelationships);
 for(const key of ['relationshipCoverage','relationshipCoveragePercent','matchedRelationships','totalRelationships','relationshipMatches'])assert.equal(result[key],undefined);
});
test('duplicate repetitions do not inflate any authored point count',()=>{
 const once=calculateSummarizeGroupDiscussionCoverage(all,data),many=calculateSummarizeGroupDiscussionCoverage(`${all} ${all} ${all}`,data);
 assert.equal(many.matchedKeyPoints,once.matchedKeyPoints);assert.equal(many.representedSpeakers,once.representedSpeakers);assert.equal(many.matchedRelationships,once.matchedRelationships);
});
test('missing speaker contribution metadata fails closed',()=>assert.throws(()=>calculateSummarizeGroupDiscussionCoverage(all,{...data,speakerPoints:undefined}),/authored points for each speaker/));
