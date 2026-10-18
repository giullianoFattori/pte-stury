import { useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation';
import { calculateRetellLectureCoverage } from '../../domain/scoring/retell-lecture';
import { calculateReadAloudFluency, DEFAULT_READ_ALOUD_FLUENCY_CONFIG } from '../../domain/scoring/read-aloud';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';
import type { ExerciseProps } from '../study-session/types';
import { exerciseIdentity } from '../study-session/types';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription';
import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { TranscriptionPanel } from '../../shared/speech/components/TranscriptionPanel';
import { useReadAloudAudioAnalysis } from '../read-aloud/hooks/useReadAloudAudioAnalysis';
import { RetellLectureSource } from './components/RetellLectureSource';
import { RETELL_LECTURE_TIMING, startCountdown } from './services/retellLectureTimer';
import { buildRetellLectureAttempt } from './services/buildRetellLectureAttempt';
import { buildRetellLectureErrorRecords } from './services/buildRetellLectureErrorRecords';
import { buildRetellLectureReviewItems } from './services/buildRetellLectureReviewItems';

type Flow = 'ready'|'listening'|'preparation'|'recording-ready'|'recording'|'recorded'|'transcribing'|'analysed'|'saved';
export function RetellLectureExercise(props: ExerciseProps) { return <RetellLectureBody key={exerciseIdentity(props)} {...props} />; }
function RetellLectureBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'retell-lecture'), [item]);
  const persistence = useExercisePersistence(props);
  const mic = useMicrophonePermission(); const recorder = useAudioRecorder(); const transcription = useSpeechTranscription(); const analysis = useReadAloudAudioAnalysis();
  const [flow, setFlow] = useState<Flow>('ready'); const [notes, setNotes] = useState(''); const [remaining, setRemaining] = useState(10);
  const isRecording = recorder.status === 'recording'; const blocked = persistence.isSaving || persistence.isSessionSaved;
  const stopRecordingRef = useRef(recorder.stopRecording);
  useEffect(() => { stopRecordingRef.current = recorder.stopRecording; });
  const preparationTimerRef = useRef<(() => void) | null>(null), responseTimerRef = useRef<(() => void) | null>(null);
  const clearPreparationTimer = () => { preparationTimerRef.current?.(); preparationTimerRef.current = null; };
  const clearResponseTimer = () => { responseTimerRef.current?.(); responseTimerRef.current = null; };
  const coverage = useMemo(() => transcription.result?.processedLocally ? calculateRetellLectureCoverage(transcription.result.text, data) : null, [data, transcription.result]);
  const fluency = useMemo(() => {
    if (!analysis.result || !transcription.result) return null;
    return calculateReadAloudFluency(analysis.result, tokenizeText(transcription.result.text).length || undefined, DEFAULT_READ_ALOUD_FLUENCY_CONFIG);
  }, [analysis.result, transcription.result]);
  useEffect(() => { if (recorder.status !== 'recording') clearResponseTimer(); }, [recorder.status]);
  useEffect(() => () => { clearPreparationTimer(); clearResponseTimer(); }, []);
  const canSave = recorder.status === 'recorded' && !!recorder.recording && transcription.status === 'success'
    && transcription.result?.processedLocally === true && !!coverage && analysis.status === 'success' && !!fluency;
  function beginPreparation() {
    clearPreparationTimer(); setFlow('preparation'); setRemaining(10);
    preparationTimerRef.current = startCountdown(RETELL_LECTURE_TIMING.preparationMs, ms => setRemaining(Math.ceil(ms / 1000)), () => { preparationTimerRef.current = null; setFlow('recording-ready'); setRemaining(0); });
  }
  function beginSourcePlayback() { clearPreparationTimer(); setFlow('listening'); }
  function stopResponse() { clearResponseTimer(); recorder.stopRecording(); }
  function clearAttempt() { if (isRecording || recorder.isFinalizing || persistence.isBlocked()) return; clearPreparationTimer(); clearResponseTimer(); persistence.reset(); recorder.resetRecording(); transcription.resetTranscription(); analysis.resetAnalysis(); setFlow('ready'); setNotes(''); setRemaining(10); }
  async function save() {
    if (!canSave || !recorder.recording || !transcription.result || !coverage || !fluency || persistence.isBlocked() || persistence.savedAttemptId) return;
    const completion = await persistence.saveOutcome(() => {
      const attempt = buildRetellLectureAttempt({ question: item, transcription: transcription.result!, coverage, fluencyMetrics: fluency, durationMs: recorder.recording!.durationMs });
      const errors = buildRetellLectureErrorRecords(item, attempt, coverage);
      return { attempt, errors, reviews: buildRetellLectureReviewItems(attempt, errors) };
    });
    if (completion) setFlow('saved');
  }
  const listening = flow === 'listening';
  return <section className="practice-card" aria-labelledby="rtl-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Listening + Speaking</p><h2 id="rtl-title">Retell Lecture</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>Retell the lecture in your own words. Cover its main points and relationships; avoid irrelevant or memorized material.</p>
    <RetellLectureSource audio={data.audio} disabled={!(flow === 'ready' || flow === 'preparation') || isRecording || recorder.isFinalizing || blocked} onStart={beginSourcePlayback} onEnded={beginPreparation} onFailure={() => setFlow('ready')} />
    <label htmlFor="rtl-notes">Lecture notes</label><textarea id="rtl-notes" aria-label="Lecture notes" value={notes} onChange={e => setNotes(e.target.value)} disabled={isRecording || blocked} />
    {data.image && <img src={data.image.path} alt={data.imageAlt!} />}
    {listening && <p role="status">Lecture is playing. You may take notes.</p>}
    {flow === 'preparation' && <><p role="status">Preparation started. Recording opens in 10 seconds.</p><p role="timer" aria-live="off">Preparation time remaining: {remaining} seconds</p></>}
    {flow === 'recording-ready' && <p role="status">Preparation complete. You may begin your response.</p>}
    <MicrophonePanel status={mic.status} errorMessage={mic.errorMessage} onRequest={mic.requestMicrophone} onDisable={mic.stopMicrophone} disableBlocked={isRecording || blocked} />
    <RecorderPanel status={recorder.status} recording={recorder.recording} errorMessage={recorder.errorMessage}
      canStart={flow === 'recording-ready' && mic.status === 'ready' && !blocked} isFinalizing={recorder.isFinalizing} disabled={blocked}
      instruction={isRecording ? `Response time remaining: ${Math.ceil(remaining)}` : 'Recording window: up to 40 seconds.'}
      onStart={() => { if (flow !== 'recording-ready' || !mic.streamRef.current || blocked) return; transcription.resetTranscription(); analysis.resetAnalysis(); if (recorder.startRecording(mic.streamRef.current)) { setFlow('recording'); setRemaining(40); responseTimerRef.current = startCountdown(RETELL_LECTURE_TIMING.responseMs, ms => setRemaining(Math.ceil(ms / 1000)), () => { responseTimerRef.current = null; stopRecordingRef.current(); }); } }}
      onStop={stopResponse} onReset={clearAttempt} />
    {isRecording && <p aria-live="off">Recording · {Math.ceil(remaining)} seconds remaining</p>}
    {recorder.status === 'recorded' && <>
      <TranscriptionPanel provider={transcription.provider} language={transcription.language} onLanguageChange={transcription.changeLanguage} status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage} hasRecording disabled={isRecording || blocked} onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage} onTranscribe={async () => { setFlow('transcribing'); await transcription.transcribe(recorder.recording!.blob); setFlow('analysed'); }} />
      {transcription.result?.processedLocally === true && <section><h3>Local audio analysis</h3><button type="button" disabled={analysis.status === 'analysing' || blocked} onClick={() => void analysis.analyse(recorder.recording!.blob)}>Analyse audio locally</button>{analysis.errorMessage && <p role="alert">{analysis.errorMessage}</p>}</section>}
      {transcription.result?.processedLocally === true && <section aria-label="Retell Lecture feedback"><h3>Content coverage</h3>{coverage && <><p>{coverage.matchedKeyPoints} of {coverage.totalKeyPoints} key points detected ({Math.round(coverage.keyPointCoveragePercent)}%)</p><h4>Covered</h4>{coverage.matches.filter(m => m.matched).map(m => <p key={m.keyPoint}>✓ {m.keyPoint}</p>)}<h4>Not detected in your transcript</h4>{coverage.matches.filter(m => !m.matched).map(m => <p key={m.keyPoint}>○ {m.keyPoint}</p>)}<p>Keyword coverage: {Math.round(coverage.keywordCoveragePercent)}% · Detected word count: {coverage.responseWordCount}</p></>}</section>}
      {fluency && <section><h3>Local fluency diagnostics</h3><p>Response latency: {Math.round(fluency.responseLatencyMs)} ms</p><p>Speech duration: {Math.round(fluency.speechDurationMs / 1000)} sec</p><p>Speech ratio: {Math.round(fluency.speechRatioPercent)}%</p><p>Pauses: {fluency.pauseCount} · Long pauses: {fluency.longPauseCount} · Average pause: {Math.round(fluency.averagePauseMs)} ms · Longest pause: {Math.round(fluency.longestPauseMs)} ms</p>{fluency.hasSpeech && fluency.speechDurationMs > 0 && fluency.speechRateWpm !== undefined && <p>Speech rate: {Math.round(fluency.speechRateWpm)} wpm</p>}<p>These local diagnostics are not Pearson Oral Fluency scores.</p></section>}
      <button type="button" disabled={!canSave || blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>
      {persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Attempt saved locally. Attempt score is internal practice content coverage only, not an official Pearson score.</p>}
      {mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={clearAttempt}>Retry same lecture</button>}
    </>}
    {mode?.kind !== 'session' && onNext && persistence.savedAttemptId && <button type="button" onClick={() => { clearAttempt(); onNext(); }}>Next question</button>}
    <small>Practice assistance replay is available before recording. No official Pearson score is reproduced.</small>
  </section>;
}
