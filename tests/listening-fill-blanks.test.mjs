import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { scoreListeningFillBlanks } from '../src/domain/scoring/listening-fill-blanks/index.ts';
import { parseTaskData, readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { buildListeningFillBlanksAttempt } from '../src/features/listening-fill-blanks/services/buildListeningFillBlanksAttempt.ts';
import { buildListeningFillBlanksErrorRecords } from '../src/features/listening-fill-blanks/services/buildListeningFillBlanksErrorRecords.ts';
import { buildListeningFillBlanksReviewItems } from '../src/features/listening-fill-blanks/services/buildListeningFillBlanksReviewItems.ts';
import { buildSessionSummary, SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';

const data={audio:{path:'/audio/test.mp3',sha256:'a'.repeat(64),durationMs:30000,mimeType:'audio/mpeg'},transcriptSegments:['We studied ',' carefully. The result was ',' for future planning.'],blanks:[{id:'method',answer:'students'},{id:'result',answer:'significant'}]};
const item={id:'lfb-000001',taskType:'listening-fill-blanks-type-in',difficulty:2,prompt:'Complete the transcript.',revision:3,status:'active',createdAt:'2026-11-01T00:00:00.000Z',taskData:data};

test('LFB exact scorer trims outer whitespace and ignores case but rejects spelling, morphology and synonyms',()=>{
 const result=scoreListeningFillBlanks(data.blanks,{method:' Students ',result:'significant'});assert.equal(result.rawScore,2);assert.equal(result.maxScore,2);assert.equal(result.accuracy,1);
 for(const answer of ['student','studnets','learners',''])assert.equal(scoreListeningFillBlanks(data.blanks,{method:answer,result:''}).correctCount,0);
 assert.throws(()=>scoreListeningFillBlanks(data.blanks,{method:'students'}));assert.throws(()=>scoreListeningFillBlanks([{id:'x',answer:'a'},{id:'x',answer:'b'}],{x:'a'}));assert.throws(()=>scoreListeningFillBlanks(data.blanks,{method:'a',unknown:'b'}));
});

test('LFB content structure and published audio duration are enforced',()=>{
 assert.deepEqual(readTaskData(item,'listening-fill-blanks-type-in'),data);
 assert.throws(()=>parseTaskData('listening-fill-blanks-type-in',{...data,transcriptSegments:['one']},true));
 for(const durationMs of [29999,60001])assert.throws(()=>parseTaskData('listening-fill-blanks-type-in',{...data,audio:{...data.audio,durationMs}},true));
 for(const durationMs of [30000,60000])assert.equal(parseTaskData('listening-fill-blanks-type-in',{...data,audio:{...data.audio,durationMs}},true).audio.durationMs,durationMs);
});

test('five published learner items have 4–8 stable blanks and local 30–60 second audio',async()=>{
 const ids=Array.from({length:5},(_,index)=>`lfb-${String(index+1).padStart(6,'0')}`);
 for(const id of ids){const published=JSON.parse(await readFile(`content/listening-fill-blanks-type-in/${id}.json`,'utf8'));const parsed=readTaskData(published,'listening-fill-blanks-type-in');assert.ok(parsed.blanks.length>=4&&parsed.blanks.length<=8);assert.equal(new Set(parsed.blanks.map(blank=>blank.id)).size,parsed.blanks.length);assert.ok(parsed.blanks.every(blank=>blank.answer.trim()));assert.ok(parsed.audio.durationMs>=30000&&parsed.audio.durationMs<=60000);assert.match(parsed.audio.path,/^\/audio\//);}
});

test('Attempt persists stable blank IDs, normalized score and exact raw counts; invalid IDs fail closed',()=>{
 const attempt=buildListeningFillBlanksAttempt({question:item,answers:{method:'students',result:'signifcant'},durationMs:35000,sourcePlaybackStarted:true});
 assert.equal(attempt.taskType,'listening-fill-blanks-type-in');assert.equal(attempt.itemRevision,3);assert.equal(attempt.score,.5);assert.equal(attempt.metrics.rawScore,1);assert.equal(attempt.metrics.maxScore,2);assert.equal(attempt.metrics.correctBlanks,1);assert.equal(attempt.metrics.incorrectBlanks,1);assert.deepEqual(attempt.responseData,{kind:'blank-text',answers:{method:'students',result:'signifcant'}});
 assert.throws(()=>buildListeningFillBlanksAttempt({question:{...item,taskType:'read-aloud'},answers:{method:'',result:''},durationMs:10,sourcePlaybackStarted:true}));
 assert.throws(()=>buildListeningFillBlanksAttempt({question:item,answers:{method:'x',other:'y'},durationMs:10,sourcePlaybackStarted:true}));
 assert.throws(()=>buildListeningFillBlanksAttempt({question:item,answers:{method:'x',result:'y'},durationMs:10,sourcePlaybackStarted:false}));
});

test('LFB Errors classify omissions and likely spelling misses; bounded contextual Reviews use blank truth',()=>{
 const attempt=buildListeningFillBlanksAttempt({question:item,answers:{method:'student',result:''},durationMs:1000,sourcePlaybackStarted:true});const errors=buildListeningFillBlanksErrorRecords(item,attempt);
 assert.deepEqual(errors.map(error=>error.category),['spelling','omission']);assert.equal(errors[0].taskType,item.taskType);
 const reviews=buildListeningFillBlanksReviewItems(item,attempt,errors);assert.equal(reviews.length,2);assert.ok(reviews.every(review=>review.prompt.includes('[____]')&&review.answer));
});

test('LFB completed-session summary pools blank counts and validates metric integrity',()=>{
 const session={id:'lfb-session',mode:'task',status:'completed',startedAt:'2026-11-01T00:00:00.000Z',finishedAt:'2026-11-01T00:02:00.000Z',taskTypes:[item.taskType],itemIds:[item.id],currentIndex:1,attemptIds:['lfb-attempt'],config:{itemCount:1,taskTypes:[item.taskType]}};
 const attempt=buildListeningFillBlanksAttempt({question:item,answers:{method:'students',result:''},durationMs:30000,sourcePlaybackStarted:true});attempt.id='lfb-attempt';attempt.sessionId=session.id;
 const summary=buildSessionSummary(session,[attempt]).byTask[item.taskType];assert.ok(SESSION_SUMMARY_TASKS.includes(item.taskType));assert.equal(summary.correctBlanks,1);assert.equal(summary.totalBlanks,2);assert.equal(summary.accuracyPercent,50);assert.equal(summary.allCorrectCount,0);
 const corrupt=structuredClone(attempt);corrupt.metrics.unansweredBlanks=2;assert.throws(()=>buildSessionSummary(session,[corrupt]),error=>error.code==='SESSION_SUMMARY_CORRUPT');
});
