import{Fragment,useEffect,useMemo,useRef,useState}from'react';
import{readTaskData}from'../../domain/content/taskDataValidation.ts';
import{scoreHighlightIncorrectWords}from'../../domain/scoring/highlight-incorrect-words/index.ts';
import{exerciseIdentity,type ExerciseProps}from'../study-session/types.ts';
import{useExercisePersistence}from'../study-session/hooks/useExercisePersistence.ts';
import{buildHighlightIncorrectWordsAttempt}from'./services/buildHighlightIncorrectWordsAttempt.ts';
import{buildHighlightIncorrectWordsErrorRecords}from'./services/buildHighlightIncorrectWordsErrorRecords.ts';
import{buildHighlightIncorrectWordsReviewItems}from'./services/buildHighlightIncorrectWordsReviewItems.ts';
import{HIW_PREVIEW_MS,startHiwPreview}from'./services/highlightIncorrectWordsTimer.ts';
import type{HighlightWordToken}from'../../domain/pte/taskData.ts';
type Flow='ready'|'preview'|'listening'|'answer-ready'|'submitted'|'saved';
export function HighlightIncorrectWordsExercise(props:ExerciseProps){return<HiwBody key={exerciseIdentity(props)} {...props}/>;}
function HiwBody(props:ExerciseProps){
 const{item,mode,onNext,progress}=props,data=useMemo(()=>readTaskData(item,'highlight-incorrect-words'),[item]),persistence=useExercisePersistence(props),[flow,setFlow]=useState<Flow>('ready'),[selected,setSelected]=useState<readonly string[]>([]),[remaining,setRemaining]=useState(HIW_PREVIEW_MS),[playbackError,setPlaybackError]=useState<string|null>(null);
 const flowRef=useRef<Flow>('ready'),audioRef=useRef<HTMLAudioElement>(null),timerRef=useRef<(()=>void)|null>(null),startedAtRef=useRef(0),durationRef=useRef(0),playedRef=useRef(false),submittedRef=useRef(false),playRef=useRef<()=>void>(()=>{});
 const changeFlow=(next:Flow)=>{flowRef.current=next;setFlow(next);},score=useMemo(()=>scoreHighlightIncorrectWords(data.displayedTokens,selected),[data,selected]),tokensById=useMemo(()=>new Map(data.displayedTokens.map(token=>[token.id,token])),[data]),blocked=persistence.isSaving||persistence.isSessionSaved;
 function failedPlayback(){if(flowRef.current!=='listening'&&flowRef.current!=='preview')return;timerRef.current?.();timerRef.current=null;playedRef.current=false;setPlaybackError('The local recording could not be played. Start again to retry.');changeFlow('ready');}
 function playSource(){changeFlow('listening');const audio=audioRef.current;if(!audio){failedPlayback();return;}playedRef.current=true;void audio.play().catch(failedPlayback);}
 useEffect(()=>{playRef.current=playSource;});
 useEffect(()=>()=>{timerRef.current?.();timerRef.current=null;if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;}},[]);
 function start(){if(flowRef.current!=='ready'||blocked)return;submittedRef.current=false;playedRef.current=false;setSelected([]);setRemaining(HIW_PREVIEW_MS);setPlaybackError(null);startedAtRef.current=performance.now();changeFlow('preview');timerRef.current=startHiwPreview(ms=>setRemaining(ms),()=>{timerRef.current=null;playRef.current();});}
 function ended(){if(flowRef.current==='listening')changeFlow('answer-ready');}
 function toggle(id:string){if(blocked||!['listening','answer-ready'].includes(flowRef.current))return;setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}
 function submit(){if(flowRef.current!=='answer-ready'||!playedRef.current||submittedRef.current||blocked)return;submittedRef.current=true;durationRef.current=Math.max(0,performance.now()-startedAtRef.current);changeFlow('submitted');}
 function reset(){if(persistence.isBlocked())return;timerRef.current?.();timerRef.current=null;persistence.reset();submittedRef.current=false;playedRef.current=false;durationRef.current=0;setSelected([]);setRemaining(HIW_PREVIEW_MS);setPlaybackError(null);if(audioRef.current){audioRef.current.pause();audioRef.current.currentTime=0;}changeFlow('ready');}
 async function save(){if(flowRef.current!=='submitted'||persistence.isBlocked()||persistence.savedAttemptId)return;const result=await persistence.saveOutcome(()=>{const attempt=buildHighlightIncorrectWordsAttempt({question:item,selectedTokenIds:selected,durationMs:durationRef.current}),errors=buildHighlightIncorrectWordsErrorRecords(item,attempt);return{attempt,errors,reviews:buildHighlightIncorrectWordsReviewItems(item,attempt,errors)};});if(result)changeFlow('saved');}
 const canSelect=flow==='listening'||flow==='answer-ready';
 const list=(ids:readonly string[])=>ids.map(id=>tokensById.get(id)).filter((token):token is HighlightWordToken=>!!token);
 return<section className="practice-card" aria-labelledby="hiw-title" aria-busy={persistence.isSaving}>
  <header><p className="eyebrow">Listening + Reading</p><h2 id="hiw-title">Highlight Incorrect Words</h2></header>
  {progress&&<p role="status">Question {progress.currentIndex+1} of {progress.total}</p>}<p>{item.prompt}</p>
  <section aria-label="Transcript"><h3>Displayed transcript</h3><p className="hiw-transcript">{data.displayedTokens.map((token,index)=><Fragment key={token.id}>{index>0?' ':null}<button type="button" className="hiw-word" data-token-id={token.id} aria-pressed={selected.includes(token.id)} disabled={!canSelect||blocked} onClick={()=>toggle(token.id)}>{token.text}</button></Fragment>)}</p></section>
  <section aria-label="Source audio"><audio ref={audioRef} src={data.audio.path} preload="metadata" onEnded={ended} onError={failedPlayback}/><p>Local recording · one playback per attempt</p>{flow==='ready'&&<><p>In the test, the transcript appears for a brief skim before the recording plays automatically.</p><button type="button" disabled={blocked} onClick={start}>Start question</button></>}{flow==='preview'&&<p role="status">Skim the transcript. Audio starts when the 10-second preview ends.</p>}{flow==='listening'&&<p role="status">Audio is playing once. Select transcript words that differ from what you hear.</p>}{flow==='answer-ready'&&<p role="status">Audio ended. Review your selections, then submit.</p>}{playbackError&&<p role="alert">{playbackError}</p>}</section>
  {flow==='preview'&&<p role="timer" aria-live="off">Audio starts in {Math.ceil(remaining/1000)} seconds</p>}
  {canSelect&&<><p aria-live="off">Selected words: {selected.length}</p>{flow==='answer-ready'&&<button type="button" disabled={blocked} onClick={submit}>Submit response</button>}</>}
  {(flow==='submitted'||flow==='saved')&&<>
   <section aria-label="Scoring results"><h3>Task points</h3><p>{Math.max(0,score.rawScore)} / {score.maxScore} points</p><p>Correct selections: {score.correctSelections} · Wrong selections: {score.incorrectSelections} · Missed words: {score.missedIncorrectWords}</p><p>Precision: {Math.round(score.precision*100)}% · Recall: {Math.round(score.recall*100)}%</p>
    <h4>Correct selections</h4>{list(score.correctTokenIds).length?list(score.correctTokenIds).map(token=><p key={token.id}>✓ {token.text}</p>):<p>None</p>}
    <h4>Missed incorrect words</h4>{list(score.missedTokenIds).length?list(score.missedTokenIds).map(token=><p key={token.id}>○ Displayed: {token.text} · Audio: {token.spokenText}</p>):<p>None</p>}
    <h4>Incorrect selections</h4>{list(score.falsePositiveTokenIds).length?list(score.falsePositiveTokenIds).map(token=><p key={token.id}>✕ {token.text} matched the audio but was selected as incorrect.</p>):<p>None</p>}
   </section><details><summary>Review corrected transcript</summary><p>{data.spokenTranscript}</p></details><p>Raw points use +1 for each correct selection and −1 for each incorrect selection, with a minimum of zero. Normalized attempt score: {Math.round(score.score*100)}%. This is not a PTE section score.</p>
   <button type="button" disabled={blocked||!!persistence.savedAttemptId} onClick={()=>void save()}>{persistence.savedAttemptId?'Attempt saved':'Save attempt'}</button>{persistence.error&&<p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId&&<p role="status">Saved locally.</p>}
   {mode?.kind!=='session'&&persistence.savedAttemptId&&<button type="button" onClick={reset}>Retry same recording</button>}
  </>}
  {flow==='saved'&&mode?.kind!=='session'&&onNext&&<button type="button" onClick={()=>{reset();onNext();}}>Next question</button>}
  <small>Transcript differences are authored and scored deterministically from token IDs. Source playback and learner responses stay on this device.</small>
 </section>;
}
