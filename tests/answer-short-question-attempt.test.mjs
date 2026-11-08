import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreAnswerShortQuestion } from '../src/domain/scoring/answer-short-question/index.ts';
import { buildAnswerShortQuestionAttempt } from '../src/features/answer-short-question/services/buildAnswerShortQuestionAttempt.ts';
import { buildAnswerShortQuestionErrorRecords } from '../src/features/answer-short-question/services/buildAnswerShortQuestionErrorRecords.ts';
import { buildAnswerShortQuestionReviewItems } from '../src/features/answer-short-question/services/buildAnswerShortQuestionReviewItems.ts';
const question={id:'asq-000001',taskType:'answer-short-question',revision:3,difficulty:1,prompt:'What do we call a reference book that explains the meanings of words?',taskData:{audio:{path:'/audio/answer-short-question/asq-000001.mp3',durationMs:4000,sha256:'a'.repeat(64)},questionTranscript:'What do we call a reference book that explains the meanings of words?',acceptedAnswers:['dictionary','dictionaries']}};
test('attempt persists local transcript, 0/1 score, revision, duration and deterministic evidence',()=>{
 const score=scoreAnswerShortQuestion('Dictionary.',question.taskData.acceptedAnswers),attempt=buildAnswerShortQuestionAttempt({question,transcript:'Dictionary.',score,processedLocally:true,durationMs:2400});
 assert.equal(attempt.taskType,'answer-short-question');assert.equal(attempt.itemRevision,3);assert.equal(attempt.responseText,'Dictionary.');assert.equal(attempt.score,1);assert.equal(attempt.durationMs,2400);assert.equal(attempt.metrics.matchedAcceptedAnswer,'dictionary');assert.equal(attempt.metrics.processedLocally,true);assert.equal(attempt.metrics.recordingDurationMs,2400);
 assert.throws(()=>buildAnswerShortQuestionAttempt({question,transcript:'dictionary',score,processedLocally:false,durationMs:500}));
});
test('incorrect and omission errors are lexical only and create one bounded review',()=>{
 for(const transcript of ['magazine','']){const score=scoreAnswerShortQuestion(transcript,question.taskData.acceptedAnswers),attempt=buildAnswerShortQuestionAttempt({question,transcript,score,processedLocally:true,durationMs:1000}),errors=buildAnswerShortQuestionErrorRecords(question,attempt,score),reviews=buildAnswerShortQuestionReviewItems(question,attempt,errors);assert.equal(errors.length,1);assert.equal(errors[0].category,transcript?'vocabulary':'omission');assert.deepEqual(errors[0].skills,['listening']);assert.equal(reviews.length,1);assert.equal(reviews[0].answer,'dictionary');}
 const good=scoreAnswerShortQuestion('dictionary',question.taskData.acceptedAnswers);assert.equal(buildAnswerShortQuestionErrorRecords(question,{},good).length,0);
});
