import { useEffect,useMemo,useRef,useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { calculateSummarizeSpokenTextCoverage,validateSstForm } from '../../domain/scoring/summarize-spoken-text/index.ts';
import { exerciseIdentity,type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildSummarizeSpokenTextAttempt } from './services/buildSummarizeSpokenTextAttempt.ts';
import { buildSummarizeSpokenTextErrorRecords } from './services/buildSummarizeSpokenTextErrorRecords.ts';
import { buildSummarizeSpokenTextReviewItems } from './services/buildSummarizeSpokenTextReviewItems.ts';
import { startSstTimer,SST_TIMING } from './services/summarizeSpokenTextTimer.ts';
import { countWords } from '../../domain/scoring/shared/writing/wordCount.ts';
import type { SstAnalysis } from '../../domain/scoring/summarize-spoken-text/types.ts';

type Flow='ready'|'active-listening'|'active-writing'|'submitted'|'saved';
export function SummarizeSpokenTextExercise(props:ExerciseProps){return <SstBody key={exerciseIdentity(props)} {...props}/>;}
function SstBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'summarize-spoken-text'),[item]),persistence=useExercisePersistence(props);
 const[flow,setFlow]=useState<Flow>('ready'),[response,setResponse]=useState(''),[mainNotes,setMainNotes]=useState(''),[supportNotes,setSupportNotes]=useState(''),[remaining,setRemaining]=useState<number>(SST_TIMING.taskMs),[timedOut,setTimedOut]=useState(false),[playbackError,setPlaybackError]=useState<string|null>(null);
 const flowRef=useRef<Flow>('ready'),audioRef=useRef<HTMLAudioElement>(null),timerRef=useRef<(()=>void)|null>(null),startRef=useRef(0),durationRef=useRef(0),playbackStartedRef=useRef(false),submittedRef=useRef(false),submitRef=useRef<()=>void>(()=>{});
 const setFlowValue=(next:Flow)=>{flowRef.current=next;setFlow(next);};
 const form=useMemo(()=>validateSstForm(response),[response]);
 const analysis=useMemo<SstAnalysis>(()=>Object.freeze({form,content:calculateSummarizeSpokenTextCoverage(response,data)}),[data,form,response]);
 const blocked=persistence.isSaving||persistence.isSessionSaved,wordCount=countWords(response);
 function submit(){if(!['active-listening','active-writing'].includes(flowRef.current)||submittedRef.current||blocked||!playbackStartedRef.current)return;submittedRef.current=true;timerRef.current?.();timerRef.current=null;durationRef.current=Math.min(SST_TIMING.taskMs,Math.max(0,performance.now()-startRef.current));const audio=audioRef.current;if(audio&&!audio.paused)audio.pause();setFlowValue('submitted');}
 useEffect(()=>{submitRef.current=submit;});
 useEffect(()=>()=>{timerRef.current?.();timerRef.current=null;if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;}},[]);
 function playbackFailed(){if(flowRef.current!=='active-listening')return;timerRef.current?.();timerRef.current=null;playbackStartedRef.current=false;setPlaybackError('The local lecture audio could not be played. Start the question again to retry playback.');setFlowValue('ready');}
 function start(){if(flowRef.current!=='ready'||blocked)return;const audio=audioRef.current;if(!audio){setPlaybackError('The local lecture audio is unavailable.');return;}submittedRef.current=false;setTimedOut(false);setPlaybackError(null);setRemaining(SST_TIMING.taskMs);audio.pause();audio.currentTime=0;playbackStartedRef.current=true;startRef.current=performance.now();setFlowValue('active-listening');timerRef.current=startSstTimer(ms=>setRemaining(ms),()=>{timerRef.current=null;setTimedOut(true);submitRef.current();});void audio.play().catch(playbackFailed);}
 function onEnded(){if(flowRef.current==='active-listening')setFlowValue('active-writing');}
 function reset(){if(persistence.isBlocked())return;timerRef.current?.();timerRef.current=null;persistence.reset();submittedRef.current=false;playbackStartedRef.current=false;durationRef.current=0;if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;}setResponse('');setMainNotes('');setSupportNotes('');setTimedOut(false);setPlaybackError(null);setRemaining(SST_TIMING.taskMs);setFlowValue('ready');}
 async function save(){if(flowRef.current!=='submitted'||persistence.isBlocked()||persistence.savedAttemptId)return;const completion=await persistence.saveOutcome(()=>{const attempt=buildSummarizeSpokenTextAttempt({question:item,response,analysis,durationMs:durationRef.current,sourcePlaybackStarted:playbackStartedRef.current}),errors=buildSummarizeSpokenTextErrorRecords(item,attempt,analysis);return{attempt,errors,reviews:buildSummarizeSpokenTextReviewItems(attempt,errors)};});if(completion)setFlowValue('saved');}
 const active=flow==='active-listening'||flow==='active-writing',canSubmit=flow==='active-writing';
 return <section className="practice-card" aria-labelledby="sst-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Listening + Writing</p><h2 id="sst-title">Summarize Spoken Text</h2></header>
  {progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}<p>{item.prompt}</p>
  <section aria-label="Lecture audio"><audio ref={audioRef} src={data.audio.path} preload="metadata" onEnded={onEnded} onError={playbackFailed}/><p>Source audio · one playback per attempt · 60–90 seconds</p>
   {flow==='ready'&&<><p>The 10-minute practice timer starts with the audio when you begin. In the test, the audio starts automatically.</p><button type="button" disabled={blocked} onClick={start}>Start question</button></>}
   {flow==='active-listening'&&<p role="status">Lecture audio is playing. Take notes and write while you listen; replay is unavailable.</p>}
   {flow==='active-writing'&&<p role="status">Lecture audio ended. The same 10-minute timer continues; replay is unavailable.</p>}
   {playbackError&&<p role="alert">{playbackError}</p>}
  </section>
  {active&&<p role="timer" aria-live="off">Time remaining: {Math.floor(remaining/60_000)}:{String(Math.ceil((remaining%60_000)/1000)%60).padStart(2,'0')}</p>}
  <details open={active}><summary>Notes · local only</summary><label htmlFor="sst-main-note">Main idea</label><textarea id="sst-main-note" value={mainNotes} onChange={event=>setMainNotes(event.target.value)} disabled={!active||blocked} rows={2}/><label htmlFor="sst-support-note">Supporting points, names or numbers</label><textarea id="sst-support-note" value={supportNotes} onChange={event=>setSupportNotes(event.target.value)} disabled={!active||blocked} rows={3}/></details>
  <label htmlFor="sst-response">Your spoken-text summary</label><textarea id="sst-response" aria-label="Your spoken-text summary" value={response} onChange={event=>setResponse(event.target.value)} disabled={!active||blocked} spellCheck rows={5} maxLength={10000}/>
  {active&&<><p aria-live="off">Word count: {wordCount} · target 50–70 words</p><p>Form estimate: {form.formPoints} / 2</p><button type="button" disabled={!canSubmit||blocked} onClick={submit}>Submit response</button></>}
  {flow==='submitted'||flow==='saved'?<>
   <section aria-label="Form feedback"><h3>Form · local estimate</h3><p>{form.formPoints} / 2 · {form.wordCount} words</p><p>{form.targetRange?'Target range: 50–70 words · full Form credit':form.partialRange?'Partial range: 40–49 or 71–100 words · partial Form credit':form.zeroFormReason==='too-short'||form.zeroFormReason==='too-long'?`${form.wordCount} words receives zero Form and zero task credit under the current rule.`:'Zero Form estimate: '+(form.zeroFormReason??'structural Form rule')}</p><p>Capitalization: {form.allCaps?'all capitals':'not all capitals'} · Punctuation: {form.hasPunctuation?'present':'not detected'} · Bullet-only: {form.bulletLike?'detected':'not detected'} · Very-short-sentence pattern: {form.veryShortSentencePattern?'detected':'not detected'}</p><p>Sentence boundaries detected: {form.sentenceCount} · Starts with capital: {form.startsWithCapital?'yes':'no'} · Ends with terminal punctuation: {form.endsWithTerminalPunctuation?'yes':'no'} · Duplicate punctuation: {form.duplicatePunctuation?'yes':'no'}</p></section>
   <section aria-label="Key-point evidence"><h3>Key-point evidence detected</h3><p>{analysis.content.matchedKeyPoints} of {analysis.content.totalKeyPoints} detected — {Math.round(analysis.content.keyPointCoveragePercent)}%</p>{analysis.content.matches.map(match=><p key={match.keyPoint}>{match.matched?'✓':'○'} {match.keyPoint}</p>)}</section>
   <section aria-label="Writing mechanics"><h3>Writing mechanics</h3><p>Capitalization and punctuation checks are simple local diagnostics.</p><p>Spelling: review manually; this app does not assign an official spelling score.</p></section>
   {data.referenceSummary&&<details><summary>Example reference summary</summary><p>{data.referenceSummary}</p><small>One example only; other valid summaries are possible.</small></details>}
   <details><summary>Review source transcript</summary><p>{data.transcript}</p></details>
   {timedOut&&<p role="status">Time ended. Your response was kept for review; save it explicitly when ready.</p>}
   <p>Internal practice score: {Math.round(analysis.content.keyPointCoveragePercent)}% key-point evidence × {form.formCredit} Form credit = {Math.round(analysis.content.keyPointCoverage*form.formCredit*100)}%. Not an official Pearson score.</p>
   <button type="button" disabled={blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>
   {persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved locally. The response and practice diagnostics are stored on this device.</p>}
   {mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry same audio</button>}
  </>:null}
  {flow==='saved'&&mode?.kind!=='session'&&onNext&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
  <small>Key-point coverage is lexical evidence only. This app does not reproduce Pearson Content, Grammar, Vocabulary or Spelling scores and does not infer spelling correctness.</small>
 </section>;
}
