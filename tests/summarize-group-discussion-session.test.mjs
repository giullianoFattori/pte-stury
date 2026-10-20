import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { calculateSummarizeGroupDiscussionCoverage } from '../src/domain/scoring/summarize-group-discussion.ts';
import { buildSummarizeGroupDiscussionAttempt } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionAttempt.ts';
import { buildSummarizeGroupDiscussionErrorRecords } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionErrorRecords.ts';
import { buildSummarizeGroupDiscussionReviewItems } from '../src/features/summarize-group-discussion/services/buildSummarizeGroupDiscussionReviewItems.ts';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
import { getSessionSummary } from '../src/application/study-session/getSessionSummary.ts';
import { createAttemptsRepository } from '../src/data/repositories/attemptsRepository.ts';
import { setup, now } from './helpers/session-persistence.mjs';

const fluency={responseLatencyMs:500,speechDurationMs:6000,speechRatio:.75,speechRatioPercent:75,pauseCount:1,longPauseCount:0,averagePauseMs:100,longestPauseMs:100,hasSpeech:true,speechRateWpm:125};
function outcome(item){const data=readTaskData(item,'summarize-group-discussion'),text=[...data.keyPoints,...data.speakerPoints.flatMap(s=>s.points),...(data.relationships??[])].join('. '),transcription={text,processedLocally:true},coverage=calculateSummarizeGroupDiscussionCoverage(text,data),attempt=buildSummarizeGroupDiscussionAttempt({question:item,transcription,coverage,fluencyMetrics:fluency,durationMs:24000}),errors=buildSummarizeGroupDiscussionErrorRecords(item,attempt,coverage);return {attempt,errors,reviews:buildSummarizeGroupDiscussionReviewItems(attempt,errors)};}
test('standalone outcome persists SGD Attempt, omission Errors and bounded Reviews',async t=>{
 const h=await setup(t),item=await h.source.getById('sgd-000001'),result=outcome(item);assert.ok(result.attempt.metrics.speakerCoverage>0);await persistExerciseOutcome({...result,item,mode:{kind:'standalone'},now:()=>now},h.outcomes);
 assert.equal((await h.db.attempts.get(result.attempt.id)).responseText,result.attempt.responseText);assert.equal(await h.db.errors.where('attemptId').equals(result.attempt.id).count(),result.errors.length);assert.equal(await h.db.reviews.where('sourceAttemptId').equals(result.attempt.id).count(),result.reviews.length);
});
test('Task session atomically completes SGD and produces the task-specific summary',async t=>{
 const h=await setup(t),session=await h.start({mode:'task',taskTypes:['summarize-group-discussion'],itemCount:1}),item=await h.source.getById(session.itemIds[0]),result=outcome(item);
 const completion=await persistExerciseOutcome({...result,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:true},now:()=>now},h.outcomes);
 assert.equal(completion.session.status,'completed');const attempt=await h.db.attempts.get(result.attempt.id);assert.equal(attempt.sessionId,session.id);assert.equal((await h.sessions.getById(session.id)).attemptIds[0],attempt.id);
 const summary=await getSessionSummary(session.id,{sessions:h.sessions,attempts:createAttemptsRepository(h.db)}),task=summary.byTask['summarize-group-discussion'];
 assert.equal(task.questionCount,1);assert.equal(task.matchedKeyPoints,result.attempt.metrics.matchedKeyPoints);assert.equal(task.representedSpeakers,3);assert.equal(task.totalSpeakerSlots,3);assert.ok(task.averageRelationshipCoveragePercent>0);
 await assert.rejects(persistExerciseOutcome({...result,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:true},now:()=>now},h.outcomes),e=>e.code==='SESSION_PROGRESS_CONFLICT');
});
