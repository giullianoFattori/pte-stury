import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateEssayForm } from '../src/domain/scoring/write-essay/form.ts';
import { calculateEssayRequirementCoverage } from '../src/domain/scoring/write-essay/content.ts';
import { analyseWriteEssay } from '../src/domain/scoring/write-essay/index.ts';
import { readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { buildWriteEssayAttempt } from '../src/features/write-essay/services/buildWriteEssayAttempt.ts';
import { buildWriteEssayErrorRecords } from '../src/features/write-essay/services/buildWriteEssayErrorRecords.ts';
import { buildWriteEssayReviewItems } from '../src/features/write-essay/services/buildWriteEssayReviewItems.ts';
import { ESSAY_FORM_CONFIG } from '../src/domain/scoring/write-essay/form.ts';
import { WRITE_ESSAY_TIMING, startWriteEssayTimer } from '../src/features/write-essay/services/writeEssayTimer.ts';
import { countDetectedSentences } from '../src/domain/scoring/shared/writing/sentenceBoundaries.ts';

const words = count => Array.from({length:count},(_,i)=>`word${i}`).join(' ');
const data={prompt:'Discuss the issue. Give your view.',positionType:'open-argument',keyRequirements:['public transport','reduce congestion','support local communities']};
const question={id:'we-000001',taskType:'write-essay',revision:4,difficulty:2,prompt:data.prompt,taskData:data,status:'active'};
function clock(){let now=0,next=0;const jobs=new Map();return{scheduler:{now:()=>now,setTimeout:(fn,ms)=>{const id=++next;jobs.set(id,{fn,due:now+ms});return id;},clearTimeout:id=>jobs.delete(id)},advance(ms){const target=now+ms;while(true){const entry=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];if(!entry||entry[1].due>target)break;jobs.delete(entry[0]);now=entry[1].due;entry[1].fn();}now=target;},get pending(){return jobs.size;}};}

test('essay Form bands use the exact 120/200/300/380 word boundaries',()=>{
 for(const [n,points] of [[119,0],[120,1],[199,1],[200,2],[300,2],[301,1],[380,1],[381,0]])assert.equal(validateEssayForm(`${words(n)}.`).formPoints,points,`${n} words`);
 assert.equal(ESSAY_FORM_CONFIG.fullMinimum,200);assert.equal(ESSAY_FORM_CONFIG.fullMaximum,300);
});
test('structural Form-zero rules override otherwise valid word bands',()=>{
 assert.equal(validateEssayForm(`${words(220).toUpperCase()}.`).zeroFormReason,'all-caps');
 assert.equal(validateEssayForm(words(220)).zeroFormReason,'no-punctuation');
 assert.equal(validateEssayForm(`${Array.from({length:220},(_,i)=>`- item${i}`).join('\n')}.`).zeroFormReason,'bullet-like');
 assert.equal(validateEssayForm(Array.from({length:4},()=> 'We learn.').join(' ')).zeroFormReason,'very-short-sentences');
});
test('requirements use authored lexical evidence without repeat inflation',()=>{
 const all=calculateEssayRequirementCoverage('Public transport can reduce congestion and support local communities.',data);
 assert.equal(all.coverage,1);assert.equal(all.matchedRequirements,3);
 assert.equal(calculateEssayRequirementCoverage('public transport public transport',data).matchedRequirements,1);
 assert.equal(calculateEssayRequirementCoverage('unrelated words only',data).coverage,0);
 assert.equal(calculateEssayRequirementCoverage('',data).coverage,0);
});
test('paragraph, transition and mechanics diagnostics are transparent and structural',()=>{
 const text='In this essay, public transport can reduce congestion.\n\nHowever, it needs investment and reliable service.\n\nIn conclusion, it can support local communities.';
 const result=analyseWriteEssay(text,data);assert.equal(result.structure.paragraphCount,3);assert.equal(result.structure.hasIntroductionLikeOpening,true);assert.equal(result.structure.hasConclusionSignal,true);assert.deepEqual(result.structure.transitionSignals,['however','in conclusion']);assert.equal(result.mechanics.sentenceCount,3);
});
test('Attempt score is requirement coverage multiplied by Form credit and preserves revision',()=>{
 const response=`Public transport can reduce congestion. ${words(194)}.`;const analysis=analyseWriteEssay(response,data);
 const attempt=buildWriteEssayAttempt({question,response,analysis,durationMs:1234,timedOut:false});
 assert.equal(attempt.taskType,'write-essay');assert.equal(attempt.itemRevision,4);assert.equal(attempt.responseText,response);assert.equal(attempt.metrics.formPoints,1);assert.equal(attempt.score,analysis.requirements.coverage*.5);assert.equal(attempt.metrics.wordCount,analysis.form.wordCount);assert.equal(attempt.metrics.timedOut,false);
 assert.throws(()=>buildWriteEssayAttempt({question:{...question,taskType:'write-from-dictation'},response,analysis,durationMs:1,timedOut:false}));assert.throws(()=>buildWriteEssayAttempt({question,response,analysis,durationMs:Infinity,timedOut:false}));
});
test('errors and reviews are deterministic and bounded',()=>{
 const response=`${words(220)}.`;const analysis=analyseWriteEssay(response,data),attempt=buildWriteEssayAttempt({question,response,analysis,durationMs:50,timedOut:false});
 const errors=buildWriteEssayErrorRecords(question,attempt,analysis),reviews=buildWriteEssayReviewItems(attempt,errors);assert.ok(errors.length<=5);assert.ok(reviews.length<=3);assert.ok(errors.some(error=>error.category==='omission'));assert.ok(reviews.every(review=>review.taskType==='write-essay'));
});
test('five published prompts have varied types and complete requirement metadata',async()=>{
 const rows=await Promise.all(Array.from({length:5},(_,i)=>readFile(`content/write-essay/we-${String(i+1).padStart(6,'0')}.json`,'utf8').then(JSON.parse)));
 assert.equal(new Set(rows.map(row=>row.taskData.positionType)).size,5);for(const row of rows){const parsed=readTaskData(row,'write-essay');assert.ok(parsed.keyRequirements.length>=2&&parsed.keyRequirements.length<=5);assert.ok(parsed.prompt.length>0);assert.ok(countDetectedSentences(parsed.prompt)>=2&&countDetectedSentences(parsed.prompt)<=3);assert.equal(row.prompt,parsed.prompt);}
});
test('20-minute timer completes once and cancellation clears scheduled callbacks',()=>{
 const c=clock();let done=0;startWriteEssayTimer(()=>{},()=>done++,c.scheduler);assert.equal(WRITE_ESSAY_TIMING.taskMs,1_200_000);c.advance(1_199_999);assert.equal(done,0);c.advance(1);assert.equal(done,1);c.advance(100);assert.equal(done,1);assert.equal(c.pending,0);
 const second=clock();let canceled=0;const cancel=startWriteEssayTimer(()=>{},()=>canceled++,second.scheduler);cancel();second.advance(1_200_000);assert.equal(canceled,0);assert.equal(second.pending,0);
});
