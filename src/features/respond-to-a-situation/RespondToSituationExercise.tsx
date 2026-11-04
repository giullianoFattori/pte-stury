import { useEffect,useMemo,useRef,useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation';
import { calculateRespondToSituationCoverage,diagnoseSituationRegister } from '../../domain/scoring/respond-to-a-situation';
import { calculateReadAloudFluency,DEFAULT_READ_ALOUD_FLUENCY_CONFIG } from '../../domain/scoring/read-aloud';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText.ts';
import type { ExerciseProps } from '../study-session/types';
import { exerciseIdentity } from '../study-session/types';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription';
import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { TranscriptionPanel } from '../../shared/speech/components/TranscriptionPanel';
import { useReadAloudAudioAnalysis } from '../read-aloud/hooks/useReadAloudAudioAnalysis';
import { startSituationPreparation,startSituationResponse } from './services/respondToSituationTimer';
import { buildRespondToSituationAttempt } from './services/buildRespondToSituationAttempt';
import { buildRespondToSituationErrorRecords } from './services/buildRespondToSituationErrorRecords';
import { buildRespondToSituationReviewItems } from './services/buildRespondToSituationReviewItems';

type Flow='ready'|'prompt-playing'|'preparation'|'recording'|'recorded'|'analysed'|'saved';
export function RespondToSituationExercise(props:ExerciseProps){return <RespondToSituationBody key={exerciseIdentity(props)} {...props}/>;}
function RespondToSituationBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'respond-to-a-situation'),[item]),persistence=useExercisePersistence(props);
 const mic=useMicrophonePermission(),recorder=useAudioRecorder(),transcription=useSpeechTranscription(),analysis=useReadAloudAudioAnalysis();
 const[flow,setFlow]=useState<Flow>('ready'),[notes,setNotes]=useState(''),[remaining,setRemaining]=useState(10),[audioError,setAudioError]=useState<string|null>(null);
 const audioRef=useRef<HTMLAudioElement>(null),prepRef=useRef<(()=>void)|null>(null),responseRef=useRef<(()=>void)|null>(null),stopRef=useRef(recorder.stopRecording),startedAt=useRef<number|null>(null),durationRef=useRef(0);
 const blocked=persistence.isSaving||persistence.isSessionSaved,isRecording=recorder.status==='recording';
 useEffect(()=>{stopRef.current=recorder.stopRecording;});
 const clearTimers=()=>{prepRef.current?.();prepRef.current=null;responseRef.current?.();responseRef.current=null;};
 useEffect(()=>()=>{clearTimers();audioRef.current?.pause();},[]);
 useEffect(()=>{if(recorder.status!=='recording'){responseRef.current?.();responseRef.current=null;}},[recorder.status]);
 const coverage=useMemo(()=>transcription.result?.processedLocally?calculateRespondToSituationCoverage(transcription.result.text,data):null,[data,transcription.result]);
 const register=useMemo(()=>transcription.result?diagnoseSituationRegister(transcription.result.text,data.scenario.register):null,[data.scenario.register,transcription.result]);
 const fluency=useMemo(()=>analysis.result&&transcription.result?calculateReadAloudFluency(analysis.result,tokenizeText(transcription.result.text).length||undefined,DEFAULT_READ_ALOUD_FLUENCY_CONFIG):null,[analysis.result,transcription.result]);
 const canSave=recorder.status==='recorded'&&!!recorder.recording&&transcription.status==='success'&&transcription.result?.processedLocally===true&&tokenizeText(transcription.result.text).length>0&&!!coverage&&!!register&&analysis.status==='success'&&!!fluency;
 function startResponse(){const stream=mic.streamRef.current;if(!stream||blocked)return;transcription.resetTranscription();analysis.resetAnalysis();if(recorder.startRecording(stream)){setFlow('recording');setRemaining(40);responseRef.current=startSituationResponse(ms=>setRemaining(Math.ceil(ms/1000)),()=>{responseRef.current=null;stopRef.current();});}else setFlow('recording');}
 function startQuestion(){if(flow!=='ready'||blocked||mic.status!=='ready')return;const audio=audioRef.current;if(!audio){setAudioError('The local situation audio is unavailable.');return;}clearTimers();setAudioError(null);setNotes('');setRemaining(10);durationRef.current=0;startedAt.current=performance.now();audio.currentTime=0;setFlow('prompt-playing');void audio.play().catch(()=>{setAudioError('The local prompt audio could not be played. Please retry.');setFlow('ready');});}
 function promptEnded(){if(flow!=='prompt-playing')return;setFlow('preparation');setRemaining(10);prepRef.current=startSituationPreparation(ms=>setRemaining(Math.ceil(ms/1000)),()=>{prepRef.current=null;startResponse();});}
 function stopResponse(){responseRef.current?.();responseRef.current=null;if(startedAt.current!==null)durationRef.current=Math.max(1,Math.round(performance.now()-startedAt.current));recorder.stopRecording();}
 function reset(){if(isRecording||recorder.isFinalizing||persistence.isBlocked())return;clearTimers();audioRef.current?.pause();if(audioRef.current)audioRef.current.currentTime=0;persistence.reset();recorder.resetRecording();transcription.resetTranscription();analysis.resetAnalysis();startedAt.current=null;durationRef.current=0;setFlow('ready');setNotes('');setRemaining(10);setAudioError(null);}
 async function save(){if(!canSave||!recorder.recording||!transcription.result||!coverage||!register||!fluency||persistence.isBlocked()||persistence.savedAttemptId)return;const result=await persistence.saveOutcome(()=>{const attempt=buildRespondToSituationAttempt({question:item,transcription:transcription.result!,coverage,register,fluencyMetrics:fluency,durationMs:Math.min(40_000,recorder.recording!.durationMs||durationRef.current)});const errors=buildRespondToSituationErrorRecords(item,attempt,coverage);return{attempt,errors,reviews:buildRespondToSituationReviewItems(attempt,errors)};});if(result)setFlow('saved');}
 return <section className="practice-card" aria-labelledby="rts-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Speaking</p><h2 id="rts-title">Respond to a Situation</h2></header>
  {progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}
  <p>Respond to the situation in your own words. These are local practice diagnostics, not Pearson trait scores.</p>
  <section aria-label="Situation"><h3>Situation</h3><p>{item.prompt}</p><p><strong>Your role:</strong> {data.scenario.role}</p><p><strong>Audience:</strong> {data.scenario.audience}</p><p><strong>Relationship:</strong> {data.scenario.relationship}</p><p><strong>Communication goal:</strong> {data.scenario.communicationGoal}</p><p><strong>Spoken prompt:</strong> {data.promptText}</p></section>
  <audio ref={audioRef} src={data.audio.path} preload="auto" onEnded={promptEnded} onError={()=>{setAudioError('The local situation audio could not be loaded.');setFlow('ready');}} aria-hidden="true" />
  <label htmlFor="rts-notes">Situation notes (not saved or scored)</label><textarea id="rts-notes" value={notes} onChange={e=>setNotes(e.target.value)} disabled={isRecording||blocked||flow==='saved'} />
  <MicrophonePanel status={mic.status} errorMessage={mic.errorMessage} onRequest={mic.requestMicrophone} onDisable={mic.stopMicrophone} disableBlocked={flow!=='ready'||blocked} description="Enable the microphone before starting so recording can begin immediately after preparation." />
  {flow==='ready'&&<button type="button" disabled={mic.status!=='ready'||blocked} onClick={startQuestion}>Start question</button>}
  {audioError&&<p role="alert">{audioError}</p>}
  {flow==='prompt-playing'&&<p role="status">Situation audio is playing once. You may take notes.</p>}
  {flow==='preparation'&&<><p role="status">Prompt finished. Prepare your response.</p><p role="timer" aria-live="off">Preparation time remaining: {remaining} seconds</p></>}
  {flow==='recording'&&recorder.status==='recording'&&<p role="timer" aria-live="off">Recording · {remaining} seconds remaining</p>}
  {flow==='recording'&&recorder.status!=='recorded'&&<section aria-label="Your response"><h3>Your response</h3>{recorder.errorMessage&&<p role="alert">{recorder.errorMessage}</p>}{recorder.status==='recording'?<button type="button" onClick={stopResponse} disabled={recorder.isFinalizing}>Stop recording</button>:<button type="button" onClick={startResponse} disabled={mic.status!=='ready'||blocked||recorder.isFinalizing}>Start response recording</button>}</section>}
  {recorder.status==='recorded'&&recorder.recording&&<section aria-label="Recorded response"><h3>Recorded response</h3><audio controls preload="metadata" src={recorder.recording.url} aria-label="Your recorded response"/><p>Duration: {(recorder.recording.durationMs/1000).toFixed(1)} seconds</p></section>}
  {recorder.status==='recorded'&&<>
   <TranscriptionPanel provider={transcription.provider} language={transcription.language} onLanguageChange={transcription.changeLanguage} status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage} hasRecording disabled={blocked} onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage} onTranscribe={async()=>{setFlow('recorded');await transcription.transcribe(recorder.recording!.blob);setFlow('analysed');}} />
   {transcription.result?.processedLocally===true&&<section><h3>Local audio analysis</h3><button type="button" disabled={analysis.status==='analysing'||blocked} onClick={()=>void analysis.analyse(recorder.recording!.blob)}>Analyse audio locally</button>{analysis.errorMessage&&<p role="alert">{analysis.errorMessage}</p>}</section>}
   {coverage&&<section aria-label="Situation feedback"><h3>Required points</h3><p>{coverage.matchedRequiredPoints} of {coverage.totalRequiredPoints} detected — {Math.round(coverage.requiredPointCoveragePercent)}%</p>{coverage.requiredPointMatches.map(match=><p key={match.keyPoint}>{match.matched?'✓':'○'} {match.matched?'Detected':'Not detected in your transcript'}: {match.keyPoint}</p>)}<p>Communication-goal evidence detected: {coverage.communicationGoalDetected?'Yes':'Not detected in your transcript'}</p><p>Useful functions detected: {coverage.matchedFunctions.length?coverage.matchedFunctions.join(', '):'No authored function signals detected'}</p></section>}
   {register&&<section><h3>Register signals</h3><p>Expected: {register.expected}</p><p>Detected phrase signals: {register.detectedSignals.length?register.detectedSignals.join(', '):'None detected'}</p>{register.warning&&<p>{register.warning}</p>}<small>Phrase signals are a limited heuristic, not an appropriateness score.</small></section>}
   {fluency&&<section><h3>Local fluency diagnostics</h3><p>Speech ratio: {Math.round(fluency.speechRatioPercent)}%</p><p>Long pauses: {fluency.longPauseCount}</p><p>Response latency: {Math.round(fluency.responseLatencyMs)} ms</p>{fluency.speechRateWpm!==undefined&&<p>Speech rate: {Math.round(fluency.speechRateWpm)} wpm</p>}<small>These are local diagnostics, not Pearson Oral Fluency scores. Whisper does not score pronunciation.</small></section>}
   <button type="button" disabled={!canSave||blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>
   {persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved. The internal practice score is authored required-point coverage only.</p>}
   {mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry situation</button>}
  </>}
  {mode?.kind!=='session'&&onNext&&persistence.savedAttemptId&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
 </section>;
}
