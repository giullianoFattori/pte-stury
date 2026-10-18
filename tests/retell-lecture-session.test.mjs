import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { calculateRetellLectureCoverage } from '../src/domain/scoring/retell-lecture.ts';
import { buildRetellLectureAttempt } from '../src/features/retell-lecture/services/buildRetellLectureAttempt.ts';
import { buildRetellLectureErrorRecords } from '../src/features/retell-lecture/services/buildRetellLectureErrorRecords.ts';
import { buildRetellLectureReviewItems } from '../src/features/retell-lecture/services/buildRetellLectureReviewItems.ts';
import { persistExerciseOutcome } from '../src/features/study-session/services/persistExerciseOutcome.ts';
import { getSessionSummary } from '../src/application/study-session/getSessionSummary.ts';
import { createAttemptsRepository } from '../src/data/repositories/attemptsRepository.ts';
import { setup, now } from './helpers/session-persistence.mjs';
const fluency={recordingDurationMs:4000,responseLatencyMs:350,endingSilenceMs:0,activeWindowMs:4000,speechDurationMs:3000,interiorPauseDurationMs:200,speechRatio:.75,speechRatioPercent:75,pauseCount:2,longPauseCount:1,averagePauseMs:100,longestPauseMs:600,hasSpeech:true,speechRateWpm:120};
function outcome(item){const data=readTaskData(item,'retell-lecture'),text=data.keyPoints[0],transcription={text,processedLocally:true};const coverage=calculateRetellLectureCoverage(text,data);const attempt=buildRetellLectureAttempt({question:item,transcription,coverage,fluencyMetrics:fluency,durationMs:1500});const errors=buildRetellLectureErrorRecords(item,attempt,coverage);return {attempt,errors,reviews:buildRetellLectureReviewItems(attempt,errors)};}
test('standalone outcome atomically persists Retell Lecture Attempt, omission errors and capped reviews',async t=>{
 const h=await setup(t),item=await h.source.getById('rtl-000003');const result=outcome(item);assert.ok(result.errors.length);assert.ok(result.reviews.length<=3);
 await persistExerciseOutcome({...result,item,mode:{kind:'standalone'},now:()=>now},h.outcomes);
 assert.equal((await h.db.attempts.get(result.attempt.id)).responseText,result.attempt.responseText);assert.equal(await h.db.errors.where('attemptId').equals(result.attempt.id).count(),result.errors.length);assert.equal(await h.db.reviews.where('sourceAttemptId').equals(result.attempt.id).count(),result.reviews.length);
});
test('Task session assigns sessionId before atomic progress and produces Retell Lecture summary',async t=>{
 const h=await setup(t),session=await h.start({mode:'task',taskTypes:['retell-lecture'],itemCount:1}),item=await h.source.getById(session.itemIds[0]),result=outcome(item);
 const completion=await persistExerciseOutcome({...result,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:true},now:()=>now},h.outcomes);
 assert.equal(completion.session.status,'completed');const attempt=await h.db.attempts.get(result.attempt.id);assert.equal(attempt.sessionId,session.id);assert.equal((await h.sessions.getById(session.id)).attemptIds[0],attempt.id);
 const summary=await getSessionSummary(session.id,{sessions:h.sessions,attempts:createAttemptsRepository(h.db)});assert.equal(summary.byTask['retell-lecture'].questionCount,1);assert.equal(summary.byTask['retell-lecture'].matchedKeyPoints,result.attempt.metrics.matchedKeyPoints);assert.equal(await h.db.errors.where('attemptId').equals(attempt.id).count(),result.errors.length);assert.equal(await h.db.reviews.where('sourceAttemptId').equals(attempt.id).count(),result.reviews.length);
 await assert.rejects(persistExerciseOutcome({...result,item,mode:{kind:'session',sessionId:session.id,expectedIndex:0,expectedItemId:item.id,isFinalItem:true},now:()=>now},h.outcomes),e=>e.code==='SESSION_PROGRESS_CONFLICT');
});
