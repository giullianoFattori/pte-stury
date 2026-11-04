import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { calculateRespondToSituationCoverage,diagnoseSituationRegister } from '../src/domain/scoring/respond-to-a-situation.ts';
import { parseTaskData,readTaskData } from '../src/domain/content/taskDataValidation.ts';
import { buildRespondToSituationAttempt } from '../src/features/respond-to-a-situation/services/buildRespondToSituationAttempt.ts';
import { buildRespondToSituationErrorRecords } from '../src/features/respond-to-a-situation/services/buildRespondToSituationErrorRecords.ts';
import { buildRespondToSituationReviewItems } from '../src/features/respond-to-a-situation/services/buildRespondToSituationReviewItems.ts';
import { buildSessionSummary,SESSION_SUMMARY_TASKS } from '../src/domain/study-session/summary.ts';

const data={audio:{path:'/audio/rs/rs-001.mp3',sha256:'a'.repeat(64),durationMs:3240,mimeType:'audio/mpeg'},promptText:'Students must arrive before nine tomorrow.',scenario:{role:'student representative',audience:'lecturer',relationship:'student and lecturer',communicationGoal:'confirm arrival arrangements for the group',register:'formal'},requiredPoints:['Confirm the group arrives before nine','Ask where the group should meet','Explain that you are confirming for classmates'],usefulFunctions:['confirm','clarify']};
const question={id:'rts-000001',taskType:'respond-to-a-situation',revision:3,difficulty:1,prompt:'Respond to the situation.',taskData:data};
const fluency={recordingDurationMs:4000,responseLatencyMs:300,speechDurationMs:3000,interiorPauseDurationMs:200,speechRatio:.75,speechRatioPercent:75,pauseCount:2,longPauseCount:1,averagePauseMs:100,longestPauseMs:600,hasSpeech:true,speechRateWpm:120,endingSilenceMs:0,activeWindowMs:4000};
const response={text:'I confirm that the group arrives before nine. Could you tell me where the group should meet? I am confirming this for my classmates.',processedLocally:true,confidence:.85};

test('coverage is deterministic lexical evidence for required points and goal, with authored function signals',()=>{
 const full=calculateRespondToSituationCoverage(response.text,data);assert.equal(full.requiredPointCoverage,1);assert.equal(full.communicationGoalDetected,true);assert.deepEqual(full.matchedFunctions,['confirm']);
 const partial=calculateRespondToSituationCoverage('We will arrive before nine.',data);assert.ok(partial.requiredPointCoverage<1);assert.equal(partial.totalRequiredPoints,3);
 assert.equal(calculateRespondToSituationCoverage('unrelated words only',data).requiredPointCoverage,0);assert.equal(calculateRespondToSituationCoverage('',data).requiredPointCoverage,0);
 assert.equal(calculateRespondToSituationCoverage('confirm confirm confirm before nine',data).matchedRequiredPoints,1);
});
test('register reports only explicit phrase signals and no numeric appropriateness score',()=>{
 const result=diagnoseSituationRegister('Please, could you confirm this? Thanks.', 'formal');assert.deepEqual(result.detectedSignals,['please','could you']);assert.equal(result.warning,undefined);
 const casual=diagnoseSituationRegister('Hey mate, gonna ask you.', 'formal');assert.ok(casual.warning);assert.equal('score' in casual,false);
});
test('published situation contracts enforce prompt length and authored point count',()=>{
 assert.equal(parseTaskData('respond-to-a-situation',data,true).requiredPoints.length,3);
 assert.throws(()=>parseTaskData('respond-to-a-situation',{...data,promptText:Array(62).fill('word').join(' ')},true));
 assert.throws(()=>parseTaskData('respond-to-a-situation',{...data,requiredPoints:['one']},true));
 assert.throws(()=>parseTaskData('respond-to-a-situation',{...data,requiredPoints:['same','same']},true));
});
test('production situation bank has five active prompts, each with locally matching prompt audio metadata',async()=>{
 const rows=await Promise.all([1,2,3,4,5].map(async n=>JSON.parse(await readFile(new URL(`../content/respond-to-a-situation/rts-00000${n}.json`,import.meta.url),'utf8'))));
 assert.equal(rows.length,5);for(const row of rows){assert.equal(row.status,'active');const parsed=parseTaskData(row.taskType,row.taskData,true);assert.equal(parsed.promptText.length>0,true);assert.equal(parsed.requiredPoints.length>=2&&parsed.requiredPoints.length<=4,true);assert.ok(parsed.audio.path.startsWith('/audio/'));assert.equal(readTaskData({...row,createdAt:'2026-11-01T00:00:00.000Z'},'respond-to-a-situation').promptText,parsed.promptText);}
});
test('Attempt stores local transcript, item revision, exact local coverage score and typed diagnostics',()=>{
 const coverage=calculateRespondToSituationCoverage(response.text,data),register=diagnoseSituationRegister(response.text,data.scenario.register);
 const attempt=buildRespondToSituationAttempt({question,transcription:response,coverage,register,fluencyMetrics:fluency,durationMs:4000});
 assert.equal(attempt.taskType,'respond-to-a-situation');assert.equal(attempt.itemRevision,3);assert.equal(attempt.responseText,response.text);assert.equal(attempt.score,coverage.requiredPointCoverage);assert.equal(attempt.metrics.processedLocally,true);assert.equal(attempt.metrics.pronunciationScore,undefined);assert.equal(attempt.metrics.expectedRegisterCode,0);
 for(const transcription of [{...response,processedLocally:false},{...response,text:'  ' }])assert.throws(()=>buildRespondToSituationAttempt({question,transcription,coverage,register,fluencyMetrics:fluency,durationMs:4000}));
 for(const durationMs of [0,-1,40001,Infinity])assert.throws(()=>buildRespondToSituationAttempt({question,transcription:response,coverage,register,fluencyMetrics:fluency,durationMs}));
});
test('missed required points create bounded omission errors and scenario reviews',()=>{
 const text='I confirm the group will arrive before nine.',coverage=calculateRespondToSituationCoverage(text,data),transcription={text,processedLocally:true},register=diagnoseSituationRegister(text,data.scenario.register),attempt=buildRespondToSituationAttempt({question,transcription,coverage,register,fluencyMetrics:fluency,durationMs:3000}),errors=buildRespondToSituationErrorRecords(question,attempt,coverage),reviews=buildRespondToSituationReviewItems(attempt,errors);
 assert.equal(errors.length,2);assert.ok(errors.every(e=>e.category==='omission'&&e.explanation.includes('not detected')));assert.equal(reviews.length,2);assert.ok(reviews.every(r=>r.taskType==='respond-to-a-situation'&&r.type==='sentence'));
});
test('RTS session summary validates metrics and aggregates coverage and fluency',()=>{
 const session={id:'rts-summary',mode:'task',status:'completed',startedAt:'2026-11-01T00:00:00.000Z',finishedAt:'2026-11-01T00:01:00.000Z',taskTypes:['respond-to-a-situation'],itemIds:['rts-000001','rts-000002'],currentIndex:2,attemptIds:['a1','a2'],config:{itemCount:2,taskTypes:['respond-to-a-situation']}};
 const metrics=[{processedLocally:true,requiredPointCoverage:.5,requiredPointCoveragePercent:50,matchedRequiredPoints:2,totalRequiredPoints:4,communicationGoalDetected:true,speechRatioPercent:70,longPauseCount:1,responseLatencyMs:300,speechRateWpm:120},{processedLocally:true,requiredPointCoverage:1,requiredPointCoveragePercent:100,matchedRequiredPoints:3,totalRequiredPoints:3,communicationGoalDetected:false,speechRatioPercent:90,longPauseCount:0,responseLatencyMs:500}];
 const rows=metrics.map((m,i)=>({id:`a${i+1}`,itemId:session.itemIds[i],taskType:'respond-to-a-situation',sessionId:session.id,responseText:'local transcript',score:m.requiredPointCoverage,metrics:m}));
 const summary=buildSessionSummary(session,rows).byTask['respond-to-a-situation'];assert.ok(SESSION_SUMMARY_TASKS.includes('respond-to-a-situation'));assert.equal(summary.questionCount,2);assert.equal(summary.averageRequiredPointCoveragePercent,75);assert.equal(summary.matchedRequiredPoints,5);assert.equal(summary.totalRequiredPoints,7);assert.equal(summary.communicationGoalDetectedCount,1);assert.equal(summary.averageSpeechRatioPercent,80);assert.equal(summary.averageLongPauseCount,.5);assert.equal(summary.averageResponseLatencyMs,400);assert.equal(summary.averageSpeechRateWpm,120);
 const bad=structuredClone(rows);bad[0].metrics.matchedRequiredPoints=9;assert.throws(()=>buildSessionSummary(session,bad),e=>e.code==='SESSION_SUMMARY_CORRUPT');
});
