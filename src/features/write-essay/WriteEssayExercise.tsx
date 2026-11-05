import { useEffect,useMemo,useRef,useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { analyseWriteEssay } from '../../domain/scoring/write-essay/index.ts';
import { countWords } from '../../domain/scoring/shared/writing/wordCount.ts';
import { exerciseIdentity,type ExerciseProps } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { buildWriteEssayAttempt } from './services/buildWriteEssayAttempt.ts';
import { buildWriteEssayErrorRecords } from './services/buildWriteEssayErrorRecords.ts';
import { buildWriteEssayReviewItems } from './services/buildWriteEssayReviewItems.ts';
import { startWriteEssayTimer,WRITE_ESSAY_TIMING } from './services/writeEssayTimer.ts';

type Flow='ready'|'active'|'submitted'|'saved';
function formatTime(ms:number){const seconds=Math.ceil(ms/1000);return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function WriteEssayExercise(props:ExerciseProps){return <WriteEssayBody key={exerciseIdentity(props)} {...props}/>;}
function WriteEssayBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'write-essay'),[item]),persistence=useExercisePersistence(props);
 const[flow,setFlow]=useState<Flow>('ready'),[response,setResponse]=useState(''),[remaining,setRemaining]=useState(WRITE_ESSAY_TIMING.taskMs),[timedOut,setTimedOut]=useState(false);
 const timerRef=useRef<(()=>void)|null>(null),startRef=useRef(0),submitRef=useRef<()=>void>(()=>{}),durationRef=useRef(0),submittedRef=useRef(false);
 const analysis=useMemo(()=>analyseWriteEssay(response,data),[data,response]),wordCount=countWords(response),blocked=persistence.isSaving||persistence.isSessionSaved;
 function submit(){if(flow!=='active'||submittedRef.current||blocked)return;submittedRef.current=true;timerRef.current?.();timerRef.current=null;durationRef.current=Math.min(WRITE_ESSAY_TIMING.taskMs,Math.max(0,performance.now()-startRef.current));setFlow('submitted');}
 useEffect(()=>{submitRef.current=submit;});
 useEffect(()=>()=>{timerRef.current?.();timerRef.current=null;},[]);
 function start(){if(flow!=='ready'||blocked)return;submittedRef.current=false;setTimedOut(false);setRemaining(WRITE_ESSAY_TIMING.taskMs);startRef.current=performance.now();setFlow('active');timerRef.current=startWriteEssayTimer(ms=>setRemaining(ms),()=>{timerRef.current=null;setTimedOut(true);submitRef.current();});}
 function reset(){if(persistence.isBlocked())return;timerRef.current?.();timerRef.current=null;persistence.reset();submittedRef.current=false;durationRef.current=0;setResponse('');setTimedOut(false);setRemaining(WRITE_ESSAY_TIMING.taskMs);setFlow('ready');}
 async function save(){if(flow!=='submitted'||persistence.isBlocked()||persistence.savedAttemptId)return;const completion=await persistence.saveOutcome(()=>{const attempt=buildWriteEssayAttempt({question:item,response,analysis,durationMs:durationRef.current,timedOut}),errors=buildWriteEssayErrorRecords(item,attempt,analysis);return{attempt,errors,reviews:buildWriteEssayReviewItems(attempt,errors)};});if(completion)setFlow('saved');}
 const form=analysis.form,requirements=analysis.requirements,structure=analysis.structure,mechanics=analysis.mechanics;
 return <section className="practice-card" aria-labelledby="write-essay-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Writing</p><h2 id="write-essay-title">Write Essay</h2></header>
  {progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}
  <section aria-labelledby="essay-prompt-title"><h3 id="essay-prompt-title">Essay prompt</h3><p>{data.prompt}</p></section>
  {flow==='ready'&&<><p>The 20-minute practice timer starts when you begin. Leaving before saving discards this unsaved response.</p><button type="button" disabled={blocked} onClick={start}>Start question</button></>}
  {flow==='active'&&<p role="timer" aria-live="off">Time remaining: {formatTime(remaining)}</p>}
  <label htmlFor="write-essay-response">Your essay</label>
  <textarea id="write-essay-response" value={response} onChange={event=>setResponse(event.target.value)} disabled={flow!=='active'||blocked} rows={16} spellCheck={false} />
  {flow==='active'&&<><p aria-live="off">Word count: {wordCount} · target 200–300</p><p aria-live="off">Local Form estimate: {form.formPoints} / 2</p><button type="button" disabled={blocked} onClick={submit}>Submit essay</button></>}
  {(flow==='submitted'||flow==='saved')&&<>
   <section aria-label="Form feedback"><h3>Form · local estimate</h3><p><strong>{form.formPoints} / 2</strong> · {form.wordCount} words · {form.targetRange?'target 200–300':form.partialRange?'partial range 120–199 or 301–380':'outside the accepted word ranges'}</p>
    {form.zeroFormReason&&<p role="status">Form credit is zero: {form.zeroFormReason.replaceAll('-',' ')}. A Form score of zero gives zero task credit under the current rule.</p>}
   </section>
   <section aria-label="Prompt requirement feedback"><h3>Prompt requirements detected</h3><p>{requirements.matchedRequirements} of {requirements.totalRequirements} detected — {Math.round(requirements.coveragePercent)}%</p>{requirements.matches.map(match=><p key={match.keyPoint}>{match.matched?'✓':'○'} {match.matched?'Evidence detected':'Not detected in your essay'}: {match.keyPoint}</p>)}</section>
   <section aria-label="Essay structure diagnostics"><h3>Structure diagnostics</h3><p>Paragraphs: {structure.paragraphCount} · sentences: {mechanics.sentenceCount}</p><p>Average paragraph length: {Math.round(structure.averageParagraphWords)} words</p><p>Introduction-like opening: {structure.hasIntroductionLikeOpening?'detected':'not detected'} · conclusion signal: {structure.hasConclusionSignal?'detected':'not detected'}</p><p>Transition signals: {structure.transitionSignals.length}{structure.transitionSignals.length?` · ${structure.transitionSignals.join(', ')}`:''}</p><small>A common plan is an introduction, two body paragraphs and a conclusion. This is guidance, not a scoring rule.</small></section>
   <section aria-label="Writing mechanics"><h3>Writing mechanics</h3><p>Initial capitalization: {mechanics.startsWithCapital?'OK':'check'} · terminal punctuation: {mechanics.endsWithTerminalPunctuation?'OK':'check'} · duplicate punctuation: {mechanics.duplicatePunctuation?'detected':'none detected'}</p><p>All capitals: {form.allCaps?'yes':'no'} · bullet-only: {form.bulletLike?'yes':'no'} · very short sentences only: {form.veryShortSentencePattern?'yes':'no'}</p></section>
   {data.referenceOutline&&<details><summary>One possible plan</summary><ul>{data.referenceOutline.map((point,index)=><li key={`${index}-${point}`}>{point}</li>)}</ul><small>This outline is an example; it is not an answer key.</small></details>}
   {timedOut&&<p role="status">Time ended. Your essay was kept for review. Save it explicitly when ready.</p>}
   <p>Internal practice score: {Math.round(requirements.coverage*form.formCredit*100)}% — prompt-requirement evidence multiplied by Form credit. This is not Pearson’s essay score.</p>
   <button type="button" disabled={blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>
   {persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved locally. The essay and local diagnostics are stored on this device.</p>}
   {mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry essay</button>}
  </>}
  {flow==='saved'&&mode?.kind!=='session'&&onNext&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
  <small>Local Form, prompt-requirement, structure and mechanics diagnostics do not reproduce Pearson Content, Development, Grammar, Linguistic Range, Vocabulary or Spelling scoring.</small>
 </section>;
}
