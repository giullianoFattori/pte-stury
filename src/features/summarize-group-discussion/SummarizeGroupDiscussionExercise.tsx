import { useEffect, useMemo, useRef, useState } from 'react';
import { readTaskData } from '../../domain/content/taskDataValidation';
import { calculateSummarizeGroupDiscussionCoverage } from '../../domain/scoring/summarize-group-discussion';
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
import { LongSourceAudioPlayer } from '../../shared/components/LongSourceAudioPlayer';
import { SPOKEN_RESPONSE_PREPARATION_MS, startCountdown } from '../../shared/speech/timing';
import { buildSummarizeGroupDiscussionAttempt } from './services/buildSummarizeGroupDiscussionAttempt';
import { buildSummarizeGroupDiscussionErrorRecords } from './services/buildSummarizeGroupDiscussionErrorRecords';
import { buildSummarizeGroupDiscussionReviewItems } from './services/buildSummarizeGroupDiscussionReviewItems';

const RESPONSE_LIMIT_MS = 120_000;
type Flow = 'ready'|'listening'|'preparation'|'recording-ready'|'recording'|'recorded'|'transcribing'|'analysed'|'saved';

export function SummarizeGroupDiscussionExercise(props: ExerciseProps) {
  return <SummarizeGroupDiscussionBody key={exerciseIdentity(props)} {...props} />;
}

function SummarizeGroupDiscussionBody(props: ExerciseProps) {
  const { item, mode, onNext, progress } = props;
  const data = useMemo(() => readTaskData(item, 'summarize-group-discussion'), [item]);
  const persistence = useExercisePersistence(props);
  const mic = useMicrophonePermission(), recorder = useAudioRecorder(), transcription = useSpeechTranscription(), analysis = useReadAloudAudioAnalysis();
  const [flow, setFlow] = useState<Flow>('ready');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [topicNotes, setTopicNotes] = useState('');
  const [relationshipNotes, setRelationshipNotes] = useState('');
  const [remaining, setRemaining] = useState(10);
  const isRecording = recorder.status === 'recording', blocked = persistence.isSaving || persistence.isSessionSaved;
  const stopRecordingRef = useRef(recorder.stopRecording);
  useEffect(() => { stopRecordingRef.current = recorder.stopRecording; });
  const preparationTimer = useRef<(() => void) | null>(null), responseTimer = useRef<(() => void) | null>(null);
  const clearPreparationTimer = () => { preparationTimer.current?.(); preparationTimer.current = null; };
  const clearResponseTimer = () => { responseTimer.current?.(); responseTimer.current = null; };
  const coverage = useMemo(() => transcription.result?.processedLocally ? calculateSummarizeGroupDiscussionCoverage(transcription.result.text, data) : null, [data, transcription.result]);
  const fluency = useMemo(() => {
    if (!analysis.result || !transcription.result) return null;
    return calculateReadAloudFluency(analysis.result, tokenizeText(transcription.result.text).length || undefined, DEFAULT_READ_ALOUD_FLUENCY_CONFIG);
  }, [analysis.result, transcription.result]);
  useEffect(() => { if (recorder.status !== 'recording') clearResponseTimer(); }, [recorder.status]);
  useEffect(() => () => { clearPreparationTimer(); clearResponseTimer(); }, []);

  const canSave = recorder.status === 'recorded' && !!recorder.recording && transcription.status === 'success'
    && transcription.result?.processedLocally === true && !!coverage && analysis.status === 'success' && !!fluency;
  function beginPreparation() {
    clearPreparationTimer(); setFlow('preparation'); setRemaining(SPOKEN_RESPONSE_PREPARATION_MS / 1000);
    preparationTimer.current = startCountdown(SPOKEN_RESPONSE_PREPARATION_MS, ms => setRemaining(Math.ceil(ms / 1000)), () => {
      preparationTimer.current = null; setFlow('recording-ready'); setRemaining(0);
    });
  }
  function beginSourcePlayback() { clearPreparationTimer(); setFlow('listening'); }
  function stopResponse() { clearResponseTimer(); recorder.stopRecording(); }
  function clearAttempt() {
    if (isRecording || recorder.isFinalizing || persistence.isBlocked()) return;
    clearPreparationTimer(); clearResponseTimer(); persistence.reset(); recorder.resetRecording(); transcription.resetTranscription(); analysis.resetAnalysis();
    setFlow('ready'); setNotes({}); setTopicNotes(''); setRelationshipNotes(''); setRemaining(SPOKEN_RESPONSE_PREPARATION_MS / 1000);
  }
  async function save() {
    if (!canSave || !recorder.recording || !transcription.result || !coverage || !fluency || persistence.isBlocked() || persistence.savedAttemptId) return;
    const completion = await persistence.saveOutcome(() => {
      const attempt = buildSummarizeGroupDiscussionAttempt({ question: item, transcription: transcription.result!, coverage, fluencyMetrics: fluency, durationMs: recorder.recording!.durationMs });
      const errors = buildSummarizeGroupDiscussionErrorRecords(item, attempt, coverage);
      return { attempt, errors, reviews: buildSummarizeGroupDiscussionReviewItems(attempt, errors) };
    });
    if (completion) setFlow('saved');
  }

  return <section className="practice-card" aria-labelledby="sgd-title" aria-busy={persistence.isSaving}>
    <header><p className="eyebrow">Listening + Speaking</p><h2 id="sgd-title">Summarize Group Discussion</h2></header>
    {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
    <p>Summarize the discussion in your own words. Represent all three speakers, the main points and how their views relate.</p>
    <LongSourceAudioPlayer audioUrl={data.audio.path} sourceLabel="Group discussion audio" primaryLabel="Play discussion"
      replayLabel="Replay discussion (practice assistance)" instruction="Listen once and take speaker-based notes. Recording is unavailable while audio plays."
      disabled={!(flow === 'ready' || flow === 'preparation') || isRecording || recorder.isFinalizing || blocked}
      onStart={beginSourcePlayback} onEnded={beginPreparation} onFailure={() => setFlow('ready')} />
    <fieldset disabled={isRecording || blocked || !!persistence.savedAttemptId}>
      <legend>Discussion notes</legend>
      <label htmlFor="sgd-topic-notes">Topic / main idea</label>
      <textarea id="sgd-topic-notes" aria-label="Topic / main idea notes" value={topicNotes} onChange={event => setTopicNotes(event.target.value)} />
      {data.speakers.map((speaker, index) => <div key={speaker.id}>
        <label htmlFor={`sgd-speaker-${speaker.id}`}>Speaker {index + 1} notes — {speaker.label}</label>
        <textarea id={`sgd-speaker-${speaker.id}`} aria-label={`Speaker ${index + 1} notes — ${speaker.label}`} value={notes[speaker.id] ?? ''}
          onChange={event => setNotes(previous => ({ ...previous, [speaker.id]: event.target.value }))} />
      </div>)}
      <label htmlFor="sgd-relationship-notes">Relationships / agreements / disagreements</label>
      <textarea id="sgd-relationship-notes" aria-label="Relationship notes" value={relationshipNotes} onChange={event => setRelationshipNotes(event.target.value)} />
    </fieldset>
    {flow === 'listening' && <p role="status">Discussion is playing. You may take notes.</p>}
    {flow === 'preparation' && <><p role="status">Preparation started. Recording opens in 10 seconds.</p><p role="timer" aria-live="off">Preparation time remaining: {remaining} seconds</p></>}
    {flow === 'recording-ready' && <p role="status">Preparation complete. You may begin your response.</p>}
    <MicrophonePanel status={mic.status} errorMessage={mic.errorMessage} onRequest={mic.requestMicrophone} onDisable={mic.stopMicrophone} disableBlocked={isRecording || blocked} />
    <RecorderPanel status={recorder.status} recording={recorder.recording} errorMessage={recorder.errorMessage}
      canStart={flow === 'recording-ready' && mic.status === 'ready' && !blocked} isFinalizing={recorder.isFinalizing} disabled={blocked}
      instruction={isRecording ? `Response time remaining: ${Math.ceil(remaining)}` : 'Recording window: up to 2 minutes.'}
      onStart={() => { if (flow !== 'recording-ready' || !mic.streamRef.current || blocked) return; transcription.resetTranscription(); analysis.resetAnalysis();
        if (recorder.startRecording(mic.streamRef.current)) { setFlow('recording'); setRemaining(RESPONSE_LIMIT_MS / 1000);
          responseTimer.current = startCountdown(RESPONSE_LIMIT_MS, ms => setRemaining(Math.ceil(ms / 1000)), () => { responseTimer.current = null; stopRecordingRef.current(); }); }
      }} onStop={stopResponse} onReset={clearAttempt} />
    {isRecording && <p aria-live="off">Recording · {Math.ceil(remaining)} seconds remaining</p>}
    {recorder.status === 'recorded' && <>
      <TranscriptionPanel provider={transcription.provider} language={transcription.language} onLanguageChange={transcription.changeLanguage} status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage} hasRecording disabled={isRecording || blocked} onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage} onTranscribe={async () => { setFlow('transcribing'); await transcription.transcribe(recorder.recording!.blob); setFlow('analysed'); }} />
      {transcription.result?.processedLocally === true && <section><h3>Local audio analysis</h3><button type="button" disabled={analysis.status === 'analysing' || blocked} onClick={() => void analysis.analyse(recorder.recording!.blob)}>Analyse audio locally</button>{analysis.errorMessage && <p role="alert">{analysis.errorMessage}</p>}</section>}
      {transcription.result?.processedLocally === true && coverage && <SgdContentResult coverage={coverage} />}
      {fluency && <SgdFluencyResult fluency={fluency} />}
      <button type="button" disabled={!canSave || blocked || !!persistence.savedAttemptId} onClick={() => void save()}>{persistence.savedAttemptId ? 'Attempt saved' : 'Save attempt'}</button>
      {persistence.error && <p role="alert">{persistence.error.message}</p>}{persistence.savedAttemptId && <p role="status">Attempt saved locally. Score is internal practice key-point coverage only, not an official Pearson score.</p>}
      {mode?.kind !== 'session' && persistence.savedAttemptId && <button type="button" onClick={clearAttempt}>Retry same discussion</button>}
    </>}
    {mode?.kind !== 'session' && onNext && persistence.savedAttemptId && <button type="button" onClick={() => { clearAttempt(); onNext(); }}>Next question</button>}
    <small>Practice replay is available before recording. Local coverage diagnostics do not reproduce Pearson Content, Pronunciation or Oral Fluency scores.</small>
  </section>;
}

function SgdContentResult({ coverage }: { coverage: NonNullable<ReturnType<typeof calculateSummarizeGroupDiscussionCoverage>> }) {
  return <section aria-label="Discussion coverage"><h3>Discussion coverage</h3>
    <p>Main points: {coverage.matchedKeyPoints} of {coverage.totalKeyPoints} detected ({Math.round(coverage.keyPointCoveragePercent)}%)</p>
    <h4>Main points detected</h4>{coverage.keyPointMatches.filter(match => match.matched).map(match => <p key={match.keyPoint}>✓ {match.keyPoint}</p>)}
    <h4>Main points not detected in your transcript</h4>{coverage.keyPointMatches.filter(match => !match.matched).map(match => <p key={match.keyPoint}>○ {match.keyPoint}</p>)}
    <p>Speakers represented: {coverage.representedSpeakers} of {coverage.totalSpeakers} ({Math.round(coverage.speakerCoveragePercent)}%)</p>
    {coverage.speakerDetails.map((speaker, index) => <div key={speaker.speakerId}><h4>Speaker {index + 1} — {speaker.label}</h4>
      <p>{speaker.represented ? 'Contribution detected' : 'Contribution not detected in your transcript'}</p>
      {speaker.matches.filter(match => match.matched).map(match => <p key={match.keyPoint}>✓ {match.keyPoint}</p>)}
      {speaker.matches.filter(match => !match.matched).map(match => <p key={match.keyPoint}>○ Not detected: {match.keyPoint}</p>)}
    </div>)}
    {coverage.relationshipCoverage !== undefined && <><p>Relationships: {coverage.matchedRelationships} of {coverage.totalRelationships} detected ({Math.round(coverage.relationshipCoveragePercent!)}%)</p>
      {coverage.relationshipMatches?.filter(match => !match.matched).map(match => <p key={match.keyPoint}>○ Relationship not detected in your transcript: {match.keyPoint}</p>)}</>}
    <p>Detected word count: {coverage.responseWordCount}. Lexical coverage is not semantic understanding.</p>
  </section>;
}

function SgdFluencyResult({ fluency }: { fluency: ReturnType<typeof calculateReadAloudFluency> }) {
  return <section><h3>Local fluency diagnostics</h3><p>Response latency: {Math.round(fluency.responseLatencyMs)} ms</p>
    <p>Speech duration: {Math.round(fluency.speechDurationMs / 1000)} sec</p><p>Speech ratio: {Math.round(fluency.speechRatioPercent)}%</p>
    <p>Pauses: {fluency.pauseCount} · Long pauses: {fluency.longPauseCount} · Average pause: {Math.round(fluency.averagePauseMs)} ms · Longest pause: {Math.round(fluency.longestPauseMs)} ms</p>
    {fluency.hasSpeech && fluency.speechDurationMs > 0 && fluency.speechRateWpm !== undefined && <p>Speech rate: {Math.round(fluency.speechRateWpm)} wpm</p>}
    <p>These local diagnostics are not Pearson Oral Fluency scores.</p></section>;
}
