import { useEffect,useMemo,useRef,useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation';
import { calculateDescribeImageCoverage } from '../../domain/scoring/describe-image';
import { calculateReadAloudFluency,DEFAULT_READ_ALOUD_FLUENCY_CONFIG } from '../../domain/scoring/read-aloud';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';
import { exerciseIdentity,type ExerciseProps } from '../study-session/types';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription';
import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { TranscriptionPanel } from '../../shared/speech/components/TranscriptionPanel';
import { useReadAloudAudioAnalysis } from '../read-aloud/hooks/useReadAloudAudioAnalysis';
import { startCountdown } from '../../shared/speech/timing';
import { buildDescribeImageAttempt } from './services/buildDescribeImageAttempt';
import { buildDescribeImageErrorRecords } from './services/buildDescribeImageErrorRecords';
import { buildDescribeImageReviewItems } from './services/buildDescribeImageReviewItems';
import { DESCRIBE_IMAGE_TIMING } from './services/describeImageTimer';

const PREPARATION_MS=DESCRIBE_IMAGE_TIMING.preparationMs,RESPONSE_LIMIT_MS=DESCRIBE_IMAGE_TIMING.responseMs;
type Flow='ready'|'preparation'|'recording-ready'|'recording'|'recorded'|'transcribing'|'analysed'|'saved';
export function DescribeImageExercise(props:ExerciseProps){return <DescribeImageBody key={exerciseIdentity(props)} {...props}/>;}
function DescribeImageBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'describe-image'),[item]),persistence=useExercisePersistence(props),mic=useMicrophonePermission(),recorder=useAudioRecorder(),transcription=useSpeechTranscription(),analysis=useReadAloudAudioAnalysis();
 const[flow,setFlow]=useState<Flow>('ready'),[notes,setNotes]=useState(''),[remaining,setRemaining]=useState(25),[imageLoaded,setImageLoaded]=useState(false);
 const blocked=persistence.isSaving||persistence.isSessionSaved,isRecording=recorder.status==='recording',stopRef=useRef(recorder.stopRecording),prepRef=useRef<(()=>void)|null>(null),responseRef=useRef<(()=>void)|null>(null);
 useEffect(()=>{stopRef.current=recorder.stopRecording;});const clearPrep=()=>{prepRef.current?.();prepRef.current=null;},clearResponse=()=>{responseRef.current?.();responseRef.current=null;};
 const coverage=useMemo(()=>transcription.result?.processedLocally?calculateDescribeImageCoverage(transcription.result.text,data):null,[data,transcription.result]);
 const fluency=useMemo(()=>analysis.result&&transcription.result?calculateReadAloudFluency(analysis.result,tokenizeText(transcription.result.text).length||undefined,DEFAULT_READ_ALOUD_FLUENCY_CONFIG):null,[analysis.result,transcription.result]);
 useEffect(()=>{if(recorder.status!=='recording')clearResponse();},[recorder.status]);useEffect(()=>()=>{clearPrep();clearResponse();},[]);
 const canSave=recorder.status==='recorded'&&!!recorder.recording&&transcription.status==='success'&&transcription.result?.processedLocally===true&&!!coverage&&analysis.status==='success'&&!!fluency;
 function startQuestion(){if(flow!=='ready'||blocked)return;clearPrep();setFlow('preparation');setRemaining(PREPARATION_MS/1000);prepRef.current=startCountdown(PREPARATION_MS,ms=>setRemaining(Math.ceil(ms/1000)),()=>{prepRef.current=null;setFlow('recording-ready');setRemaining(0);});}
 function stopResponse(){clearResponse();recorder.stopRecording();}
 function reset(){if(isRecording||recorder.isFinalizing||persistence.isBlocked())return;clearPrep();clearResponse();persistence.reset();recorder.resetRecording();transcription.resetTranscription();analysis.resetAnalysis();setFlow('ready');setNotes('');setRemaining(PREPARATION_MS/1000);}
 async function save(){if(!canSave||!recorder.recording||!transcription.result||!coverage||!fluency||persistence.isBlocked()||persistence.savedAttemptId)return;const completion=await persistence.saveOutcome(()=>{const attempt=buildDescribeImageAttempt({question:item,transcription:transcription.result!,coverage,fluencyMetrics:fluency,durationMs:recorder.recording!.durationMs}),errors=buildDescribeImageErrorRecords(item,attempt,coverage);return{attempt,errors,reviews:buildDescribeImageReviewItems(attempt,errors)};});if(completion)setFlow('saved');}
 return <section className="practice-card" aria-labelledby="di-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Speaking</p><h2 id="di-title">Describe Image</h2></header>{progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}
  <p>Describe the main information, important features and relationships in your own words.</p>
  <figure><img src={data.image.path} alt={data.imageAlt} onLoad={()=>setImageLoaded(true)} onError={()=>setImageLoaded(false)} style={{display:'block',maxWidth:'100%',maxHeight:'min(60vh,640px)',width:'auto',height:'auto',objectFit:'contain',margin:'0 auto'}}/><figcaption>{data.imageType[0].toUpperCase()+data.imageType.slice(1)} · visual stimulus</figcaption></figure>
  {!imageLoaded&&<p role="alert">The local image could not be loaded.</p>}
  {flow==='ready'&&<button type="button" disabled={blocked||!imageLoaded} onClick={startQuestion}>Start question</button>}
  {flow==='preparation'&&<><p role="status">Preparation started. Use the image to plan your response.</p><p role="timer" aria-live="off">Preparation time remaining: {remaining} seconds</p><label htmlFor="di-notes">Notes · main idea, features, relationship, conclusion</label><textarea id="di-notes" aria-label="Describe Image notes" value={notes} onChange={e=>setNotes(e.target.value)} disabled={blocked}/></>}
  {flow==='recording-ready'&&<p role="status">Preparation complete. You may begin your response.</p>}
  <MicrophonePanel status={mic.status} errorMessage={mic.errorMessage} onRequest={mic.requestMicrophone} onDisable={mic.stopMicrophone} disableBlocked={isRecording||blocked}/>
  {flow!=='ready'&&<RecorderPanel status={recorder.status} recording={recorder.recording} errorMessage={recorder.errorMessage} canStart={flow==='recording-ready'&&mic.status==='ready'&&!blocked} isFinalizing={recorder.isFinalizing} disabled={blocked} instruction={isRecording?`Response time remaining: ${Math.ceil(remaining)} seconds`:'Recording window: up to 40 seconds.'} onStart={()=>{if(flow!=='recording-ready'||!mic.streamRef.current||blocked)return;transcription.resetTranscription();analysis.resetAnalysis();if(recorder.startRecording(mic.streamRef.current)){setFlow('recording');setRemaining(40);responseRef.current=startCountdown(RESPONSE_LIMIT_MS,ms=>setRemaining(Math.ceil(ms/1000)),()=>{responseRef.current=null;stopRef.current();});}}} onStop={stopResponse} onReset={reset}/>}
  {isRecording&&<p aria-live="off">Recording · {Math.ceil(remaining)} seconds remaining</p>}
  {recorder.status==='recorded'&&<><TranscriptionPanel provider={transcription.provider} language={transcription.language} onLanguageChange={transcription.changeLanguage} status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage} hasRecording disabled={isRecording||blocked} onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage} onTranscribe={async()=>{setFlow('transcribing');await transcription.transcribe(recorder.recording!.blob);setFlow('analysed');}}/>
   {transcription.result?.processedLocally===true&&<section><h3>Local audio analysis</h3><button type="button" disabled={analysis.status==='analysing'||blocked} onClick={()=>void analysis.analyse(recorder.recording!.blob)}>Analyse audio locally</button>{analysis.errorMessage&&<p role="alert">{analysis.errorMessage}</p>}</section>}
   {coverage&&transcription.result?.processedLocally===true&&<section aria-label="Visual coverage"><h3>Visual coverage</h3><p>{coverage.matchedFeatures} of {coverage.totalFeatures} key features detected — {Math.round(coverage.featureCoveragePercent)}%</p><h4>Covered</h4>{coverage.matches.filter(m=>m.matched).map(m=><p key={m.keyPoint}>✓ {m.keyPoint}</p>)}<h4>Not detected in your transcript</h4>{coverage.matches.filter(m=>!m.matched).map(m=><p key={m.keyPoint}>○ {m.keyPoint}</p>)}<p>Detected word count: {coverage.responseWordCount} · Optional keyword coverage: {Math.round(coverage.keywordCoveragePercent)}%</p><p>Lexical coverage does not interpret the image or reproduce Pearson Content scoring.</p></section>}
   {fluency&&<section><h3>Local fluency diagnostics</h3><p>Response latency: {Math.round(fluency.responseLatencyMs)} ms · Speech ratio: {Math.round(fluency.speechRatioPercent)}%</p><p>Pauses: {fluency.pauseCount} · Long pauses: {fluency.longPauseCount} · Average pause: {Math.round(fluency.averagePauseMs)} ms · Longest pause: {Math.round(fluency.longestPauseMs)} ms</p>{fluency.hasSpeech&&fluency.speechDurationMs>0&&fluency.speechRateWpm!==undefined&&<p>Speech rate: {Math.round(fluency.speechRateWpm)} wpm</p>}<p>These diagnostics are not Pearson Oral Fluency scores.</p></section>}
   <button type="button" disabled={!canSave||blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>{persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved locally. Score is internal practice feature coverage only, not an official Pearson score.</p>}{mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry same image</button>}
  </>}
  {mode?.kind!=='session'&&onNext&&persistence.savedAttemptId&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
  <small>Preparation lasts 25 seconds and the response window is capped at 40 seconds. Notes stay on this screen. This trainer does not reproduce Pearson Content, Pronunciation or Oral Fluency scores.</small>
 </section>;
}
