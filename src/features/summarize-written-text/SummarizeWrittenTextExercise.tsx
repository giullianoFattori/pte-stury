import { useEffect,useMemo,useRef,useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { calculateSummarizeWrittenTextCoverage,validateSwtForm } from '../../domain/scoring/summarize-written-text/index.ts';
import { detectSourceCopy } from '../../domain/scoring/shared/writing/copyDetection.ts';
import { countWords } from '../../domain/scoring/shared/writing/wordCount.ts';
import { exerciseIdentity,type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildSummarizeWrittenTextAttempt } from './services/buildSummarizeWrittenTextAttempt.ts';
import { buildSummarizeWrittenTextErrorRecords } from './services/buildSummarizeWrittenTextErrorRecords.ts';
import { buildSummarizeWrittenTextReviewItems } from './services/buildSummarizeWrittenTextReviewItems.ts';
import { startSwtTimer,SWT_TIMING } from './services/summarizeWrittenTextTimer.ts';
import type { SwtAnalysis } from '../../domain/scoring/summarize-written-text/types.ts';

type Flow='ready'|'active'|'submitted'|'saved';
export function SummarizeWrittenTextExercise(props:ExerciseProps){return <SwtBody key={exerciseIdentity(props)} {...props}/>;}
function SwtBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'summarize-written-text'),[item]),persistence=useExercisePersistence(props);
 const[flow,setFlow]=useState<Flow>('ready'),[response,setResponse]=useState(''),[notes,setNotes]=useState(''),[remaining,setRemaining]=useState<number>(SWT_TIMING.taskMs),[timedOut,setTimedOut]=useState(false);
 const timerRef=useRef<(()=>void)|null>(null),startRef=useRef(0),submitRef=useRef<()=>void>(()=>{}),durationRef=useRef(0),submittedRef=useRef(false);
 const form=useMemo(()=>validateSwtForm(response),[response]),wordCount=countWords(response);
 const analysis=useMemo<SwtAnalysis>(()=>{const content=calculateSummarizeWrittenTextCoverage(response,data),copy=detectSourceCopy(response,data.passage),passageWordCount=countWords(data.passage);return Object.freeze({form,content,copy,passageWordCount,compressionRatio:passageWordCount?form.wordCount/passageWordCount:0});},[data,form,response]);
 const blocked=persistence.isSaving||persistence.isSessionSaved;
 function submit(){if(flow!=='active'||submittedRef.current||blocked)return;submittedRef.current=true;timerRef.current?.();timerRef.current=null;durationRef.current=Math.min(SWT_TIMING.taskMs,Math.max(0,performance.now()-startRef.current));setFlow('submitted');}
 useEffect(()=>{submitRef.current=submit;});
 useEffect(()=>()=>{timerRef.current?.();timerRef.current=null;},[]);
 function start(){if(flow!=='ready'||blocked)return;submittedRef.current=false;setTimedOut(false);setRemaining(SWT_TIMING.taskMs);setFlow('active');startRef.current=performance.now();timerRef.current=startSwtTimer(ms=>setRemaining(ms),()=>{timerRef.current=null;setTimedOut(true);submitRef.current();});}
 function reset(){if(persistence.isBlocked())return;timerRef.current?.();timerRef.current=null;persistence.reset();submittedRef.current=false;durationRef.current=0;setResponse('');setNotes('');setTimedOut(false);setRemaining(SWT_TIMING.taskMs);setFlow('ready');}
 async function save(){if(flow!=='submitted'||persistence.isBlocked()||persistence.savedAttemptId)return;const completion=await persistence.saveOutcome(()=>{const attempt=buildSummarizeWrittenTextAttempt({question:item,response,analysis,durationMs:durationRef.current}),errors=buildSummarizeWrittenTextErrorRecords(item,attempt,analysis);return{attempt,errors,reviews:buildSummarizeWrittenTextReviewItems(attempt,errors)};});if(completion)setFlow('saved');}
 return <section className="practice-card" aria-labelledby="swt-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Reading + Writing</p><h2 id="swt-title">Summarize Written Text</h2></header>
  {progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}
  <p>{item.prompt}</p>
  <section aria-labelledby="swt-passage-title"><h3 id="swt-passage-title">Reading passage</h3><div className="swt-passage">{data.passage}</div></section>
  {flow==='ready'&&<><p>The 10-minute practice timer starts when you begin. Leaving before saving discards this unsaved response.</p><button type="button" disabled={blocked} onClick={start}>Start question</button></>}
  {flow==='active'&&<p role="timer" aria-live="off">Time remaining: {Math.floor(remaining/60_000)}:{String(Math.ceil((remaining%60_000)/1000)%60).padStart(2,'0')}</p>}
  <label htmlFor="swt-response">Your one-sentence summary</label>
  <textarea id="swt-response" aria-label="Your one-sentence summary" value={response} onChange={event=>setResponse(event.target.value)} disabled={flow!=='active'||blocked} rows={5}/>
  {flow==='active'&&<><p className="swt-word-count" aria-live="off">Word count: {wordCount} · target 5–75</p><p aria-live="off">Current Form check: {form.formValid?'one sentence, within word limit, not all capitals':'check word count, sentence count and capitalization before saving'}</p><details><summary>Optional notes</summary><label htmlFor="swt-main-note">Main idea</label><textarea id="swt-main-note" value={notes} onChange={event=>setNotes(event.target.value)} disabled={blocked} rows={3}/></details><button type="button" disabled={blocked} onClick={submit}>Submit response</button></>}
  {flow==='submitted'||flow==='saved'?<><section aria-label="Form feedback"><h3>Form · local estimate</h3><p>{form.formValid?'✓ Form checks passed':'Form not valid for PTE practice'}</p><ul><li>{form.withinWordLimit?'✓': '○'} {form.wordCount} words — 5–75 required</li><li>{form.singleSentence?'✓':'○'} {form.singleSentence?'One sentence':`${form.sentenceCount} sentences detected`}</li><li>{!form.allCaps?'✓':'○'} {!form.allCaps?'Standard capitalization':'All capitals'}</li></ul><p>Initial capital: {form.startsWithCapital?'yes':'no'} · Terminal punctuation: {form.endsWithTerminalPunctuation?'yes':'no'} · Duplicate punctuation: {form.duplicatePunctuation?'yes':'no'}</p></section>
   <section aria-label="Key-point evidence"><h3>Key-point evidence detected</h3><p>{analysis.content.matchedKeyPoints} of {analysis.content.totalKeyPoints} key points detected — {Math.round(analysis.content.keyPointCoveragePercent)}%</p>{analysis.content.matches.map(match=><p key={match.keyPoint}>{match.matched?'✓':'○'} {match.keyPoint}</p>)}</section>
   <section aria-label="Writing diagnostics"><h3>Writing diagnostics</h3><p>Direct-copy estimate: {Math.round(analysis.copy.sourceCopyPercent)}% · Longest copied run: {analysis.copy.longestCopiedRunWords} words</p><p>Response: {analysis.content.responseWordCount} words · Passage: {analysis.passageWordCount} words · Compression ratio: {Math.round(analysis.compressionRatio*100)}%</p><p>Copy detection finds contiguous lexical overlap and may flag necessary wording; it is not a vocabulary score.</p></section>
   {data.referenceSummary&&<details><summary>Example reference summary</summary><p>{data.referenceSummary}</p><small>One example only; other valid summaries are possible.</small></details>}
   {timedOut&&<p role="status">Time ended. Your response was kept for review; save it explicitly when ready.</p>}
   <p>Internal practice score: {form.formValid?Math.round(analysis.content.keyPointCoveragePercent):0}% — {form.formValid?'key-point coverage':'0 because the local Form checks did not pass'}. Not an official Pearson score.</p>
   <button type="button" disabled={blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>
   {persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved locally. The response and practice diagnostics are stored on this device.</p>}
   {mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry same passage</button>}
  </>:null}
  {flow==='saved'&&mode?.kind!=='session'&&onNext&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
  <small>Local word, sentence, key-point and source-overlap diagnostics do not reproduce Pearson Content, Grammar or Vocabulary scoring. The app does not judge whether a sentence is linguistically complete.</small>
 </section>;
}
