import { useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation.ts';
import { scoreAnswerShortQuestion } from '../../domain/scoring/answer-short-question/index.ts';
import type { ExerciseProps } from '../study-session/types.ts';
import { exerciseIdentity } from '../study-session/types.ts';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence.ts';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission.ts';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder.ts';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription.ts';
import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel.tsx';
import { ANSWER_SHORT_QUESTION_RESPONSE_MS, startAnswerShortQuestionTimer } from './services/answerShortQuestionTimer.ts';
import { buildAnswerShortQuestionAttempt } from './services/buildAnswerShortQuestionAttempt.ts';
import { buildAnswerShortQuestionErrorRecords } from './services/buildAnswerShortQuestionErrorRecords.ts';
import { buildAnswerShortQuestionReviewItems } from './services/buildAnswerShortQuestionReviewItems.ts';

type Flow = 'ready'|'playing'|'recording'|'recorded'|'saved';
export function AnswerShortQuestionExercise(props: ExerciseProps) { return <AnswerShortQuestionBody key={exerciseIdentity(props)} {...props} />; }
function AnswerShortQuestionBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'answer-short-question'), [item]);
  const persistence = useExercisePersistence(props);
  const mic = useMicrophonePermission(), recorder = useAudioRecorder(), transcription = useSpeechTranscription({ allowNoSpeechAsEmpty: true });
  const [flow, setFlow] = useState<Flow>('ready'), [remaining, setRemaining] = useState(ANSWER_SHORT_QUESTION_RESPONSE_MS);
  const [playError, setPlayError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null), timerRef = useRef<(() => void) | null>(null);
  const stopRef = useRef(recorder.stopRecording), transcribingRef = useRef(false);
  const transcribeRef = useRef(transcription.transcribe);
  const blocked = persistence.isSaving || persistence.isSessionSaved;
  useEffect(() => { stopRef.current = recorder.stopRecording; });
  useEffect(() => { transcribeRef.current = transcription.transcribe; });
  function clearTimer() { timerRef.current?.(); timerRef.current = null; }
  function stopResponse() { clearTimer(); stopRef.current(); }
  useEffect(() => { if (recorder.status !== 'recording') clearTimer(); }, [recorder.status]);
  useEffect(() => () => { clearTimer(); audioRef.current?.pause(); }, []);

  async function start() {
    if (flow !== 'ready' || blocked || mic.status !== 'ready' || !mic.streamRef.current) return;
    setPlayError(null); transcription.resetTranscription(); recorder.resetRecording();
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0; setFlow('playing');
    try { await audio.play(); } catch { setFlow('ready'); setPlayError('Unable to play the local prompt audio. Check the audio file and try again.'); }
  }
  function onPromptEnded() {
    if (flow !== 'playing' || blocked || mic.status !== 'ready' || !mic.streamRef.current) { setFlow('ready'); return; }
    if (!recorder.startRecording(mic.streamRef.current)) { setFlow('ready'); return; }
    setFlow('recording'); setRemaining(ANSWER_SHORT_QUESTION_RESPONSE_MS);
    timerRef.current = startAnswerShortQuestionTimer(ms => setRemaining(ms), () => { timerRef.current = null; stopRef.current(); });
  }
  function resetAttempt() {
    if (recorder.status === 'recording' || recorder.isFinalizing || persistence.isBlocked()) return;
    clearTimer(); persistence.reset(); recorder.resetRecording(); transcription.resetTranscription();
    setRemaining(ANSWER_SHORT_QUESTION_RESPONSE_MS); setFlow('ready'); setPlayError(null); transcribingRef.current = false;
  }
  useEffect(() => {
    if (recorder.status !== 'recorded' || !recorder.recording || transcribingRef.current) return;
    transcribingRef.current = true; setFlow('recorded');
    void transcribeRef.current(recorder.recording.blob).finally(() => { transcribingRef.current = false; });
  }, [recorder.recording, recorder.status]);

  const score = transcription.status === 'success' && transcription.result?.processedLocally === true
    ? scoreAnswerShortQuestion(transcription.result.text, data.acceptedAnswers) : null;
  const canSave = recorder.status === 'recorded' && !!score && transcription.result?.processedLocally === true;
  async function save() {
    if (!canSave || !score || !transcription.result || !recorder.recording || blocked || persistence.savedAttemptId) return;
    const completion = await persistence.saveOutcome(() => {
      const attempt = buildAnswerShortQuestionAttempt({ question: item, transcript: transcription.result!.text, score, processedLocally: transcription.result!.processedLocally, durationMs: recorder.recording!.durationMs });
      const errors = buildAnswerShortQuestionErrorRecords(item, attempt, score);
      return { attempt, errors, reviews: buildAnswerShortQuestionReviewItems(item, attempt, errors) };
    });
    if (completion) setFlow('saved');
  }

  return <section className="practice-card" aria-labelledby="asq-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Speaking &amp; Writing · Listening</p><h2 id="asq-title">Answer Short Question</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>Listen to the question and answer in one word or a few words. The microphone opens as soon as the prompt ends.</p>
    {data.image && <img src={data.image.path} alt={data.imageAlt!} />}
    <audio ref={audioRef} src={data.audio.path} preload="auto" onEnded={onPromptEnded} onError={() => { if (flow === 'playing') { setFlow('ready'); setPlayError('Unable to load the local prompt audio.'); } }} />
    <MicrophonePanel status={mic.status} errorMessage={mic.errorMessage} onRequest={mic.requestMicrophone} onDisable={mic.stopMicrophone} disableBlocked={flow === 'playing' || flow === 'recording' || recorder.isFinalizing || blocked} description="Enable the microphone before starting so recording can begin immediately when the prompt ends." />
    {flow === 'ready' && <button type="button" onClick={() => void start()} disabled={blocked || mic.status !== 'ready' || recorder.isFinalizing}>Start question</button>}
    {playError && <p role="alert">{playError}</p>}
    {flow === 'playing' && <p role="status">Prompt audio is playing once.</p>}
    {flow === 'recording' && <><p role="timer" aria-live="off">Response time remaining: {Math.ceil(remaining / 1000)} seconds</p><button type="button" onClick={stopResponse} disabled={recorder.isFinalizing || blocked}>Stop recording</button></>}
    {recorder.errorMessage && <p role="alert">{recorder.errorMessage}</p>}
    {transcription.status === 'transcribing' && <p role="status">Transcribing locally…</p>}
    {transcription.status === 'error' && <><p role="alert">{transcription.errorMessage}</p><button type="button" disabled={blocked || !recorder.recording} onClick={() => void transcription.transcribe(recorder.recording!.blob)}>Retry local transcription</button></>}
    {transcription.status === 'success' && transcription.result?.processedLocally === true && score && <>
      <section aria-label="Answer Short Question result"><h3>Result</h3><p>Local transcript: <strong>{transcription.result.text || '(no words recognized)'}</strong></p><p><strong>{score.correct ? '✓ Correct' : '✕ Incorrect'}</strong></p><p>{score.correct ? 'Accepted answer: ' : 'Accepted answers: '}{data.acceptedAnswers.join(' / ')}</p>
        {score.overlongResponse && <p>Long response: {score.responseWordCount} words. The accepted answer is still matched when clearly present.</p>}
        {flow !== 'playing' && <details><summary>Question transcript</summary><p>{data.questionTranscript}</p></details>}
      </section>
      <p>Deterministic practice matching against authored answers.</p>
      <button type="button" disabled={blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>
      {persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Saved locally.</p>}
      {mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={resetAttempt}>Retry question</button>}
    </>}
    {mode?.kind !== 'session' && onNext && persistence.savedAttemptId && <button type="button" onClick={() => { resetAttempt(); onNext(); }}>Next question</button>}
    <small>This item is scored correct or incorrect for practice. ASQ correctness is credited to Listening; it is not an overall PTE Listening score.</small>
  </section>;
}
