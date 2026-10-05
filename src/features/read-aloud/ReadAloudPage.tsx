import { useEffect, useMemo, useRef, useState } from 'react';

import { studyOutcomeRepository } from '../../data/repositories/studyOutcomeRepository';
import { buildReadAloudAttempt } from './services/buildReadAloudAttempt';
import { buildReadAloudErrorRecords } from './services/buildReadAloudErrorRecords';
import { buildReadAloudReviewItems } from './services/buildReadAloudReviewItems';

import {
  compareReadAloud, calculateReadAloudMetrics, calculateReadAloudFluency,
  buildReadAloudFluencyFeedback, DEFAULT_READ_ALOUD_FLUENCY_CONFIG,
} from '../../domain/scoring/read-aloud';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';

import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { TranscriptionPanel } from '../../shared/speech/components/TranscriptionPanel';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription';
import { RaContentResult } from './components/RaContentResult';
import { RaAudioAnalysisDebug } from './components/RaAudioAnalysisDebug';
import { RaFluencyResult } from './components/RaFluencyResult';
import { RaPassage } from './components/RaPassage';
import { RaTrainingView } from './components/RaTrainingView';
import { useReadAloud } from './hooks/useReadAloud';
import { useReadAloudAudioAnalysis } from './hooks/useReadAloudAudioAnalysis';

export function ReadAloudPage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useReadAloud();
  const {
    status: microphoneStatus, errorMessage: microphoneError, streamRef, requestMicrophone, stopMicrophone,
  } = useMicrophonePermission();
  const {
    status: recordingStatus, recording, errorMessage: recordingError, isFinalizing,
    startRecording, stopRecording, resetRecording,
  } = useAudioRecorder();
  const transcription = useSpeechTranscription({ language: 'en-AU' });
  const audioAnalysis = useReadAloudAudioAnalysis();
  const [isPreviewComplete, setIsPreviewComplete] = useState(false);
  const [showPhraseHelp, setShowPhraseHelp] = useState(false);
  const [showStressHelp, setShowStressHelp] = useState(false);
  const [isSavingAttempt, setIsSavingAttempt] = useState(false);
  const [saveAttemptError, setSaveAttemptError] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const isSavingAttemptRef = useRef(false);
  const savedAttemptIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const isRecording = recordingStatus === 'recording';
  const canStart = isPreviewComplete && microphoneStatus === 'ready' && !isRecording && !isSavingAttempt;

  const content = useMemo(() => {
    if (transcription.status !== 'success' || !transcription.result || !currentQuestion) return null;
    const expected = currentQuestion.transcript ?? currentQuestion.answer ?? '';
    const actual = transcription.result.text;
    if (!tokenizeText(expected).length) return { error: 'This passage has no usable expected text.' };
    if (!tokenizeText(actual).length) return { error: 'No usable detected speech is available.' };
    const comparison = compareReadAloud(expected, actual);
    return { comparison, metrics: calculateReadAloudMetrics(comparison) };
  }, [currentQuestion, transcription.status, transcription.result]);

  const fluency = useMemo(() => {
    if (!audioAnalysis.result) return null;
    const tokens = transcription.status === 'success' && transcription.result
      ? tokenizeText(transcription.result.text) : [];
    const metrics = calculateReadAloudFluency(
      audioAnalysis.result, tokens.length ? tokens.length : undefined, DEFAULT_READ_ALOUD_FLUENCY_CONFIG,
    );
    return { metrics, feedback: buildReadAloudFluencyFeedback(metrics) };
  }, [audioAnalysis.result, transcription.status, transcription.result]);

  const canSave = recordingStatus === 'recorded' && !!recording
    && transcription.status === 'success' && transcription.result?.processedLocally === true
    && !!content && !('error' in content) && audioAnalysis.status === 'success'
    && !!audioAnalysis.result && !!fluency;

  function resetSaveState() {
    savedAttemptIdRef.current = null;
    setSavedAttemptId(null);
    setSaveAttemptError(null);
  }

  async function saveAttempt() {
    if (!isMountedRef.current || isSavingAttemptRef.current || savedAttemptIdRef.current || !canSave
      || !currentQuestion || !recording || !transcription.result || !content || 'error' in content || !fluency) return;
    isSavingAttemptRef.current = true;
    setIsSavingAttempt(true);
    setSaveAttemptError(null);
    try {
      const attempt = buildReadAloudAttempt({
        question: currentQuestion, transcription: transcription.result,
        comparison: content.comparison, contentMetrics: content.metrics,
        fluencyMetrics: fluency.metrics,
        longPauseThresholdMs: DEFAULT_READ_ALOUD_FLUENCY_CONFIG.longPauseMs,
        durationMs: recording.durationMs,
      });
      const errors = buildReadAloudErrorRecords(attempt, content.comparison);
      const reviews = buildReadAloudReviewItems({ question: currentQuestion, attempt, errors });
      await studyOutcomeRepository.createStudyOutcome({ attempt, errors, reviews });
      if (isMountedRef.current) {
        savedAttemptIdRef.current = attempt.id;
        setSavedAttemptId(attempt.id);
      }
    } catch (error) {
      console.error('Failed to save Read Aloud attempt:', error);
      if (isMountedRef.current) setSaveAttemptError('Your Read Aloud attempt could not be saved. Please try again.');
    } finally {
      isSavingAttemptRef.current = false;
      if (isMountedRef.current) setIsSavingAttempt(false);
    }
  }

  async function handleAnalyse() {
    if (isSavingAttemptRef.current || !recording || recordingStatus !== 'recorded') return;
    await audioAnalysis.analyse(recording.blob);
  }

  async function handleTranscribe() {
    if (isSavingAttemptRef.current || !recording || recordingStatus !== 'recorded') return;
    await transcription.transcribe(recording.blob);
  }

  function handleResetRecording() {
    if (isSavingAttemptRef.current) return;
    resetSaveState();
    transcription.resetTranscription();
    audioAnalysis.resetAnalysis();
    resetRecording();
  }

  function handleStartRecording() {
    if (!isSavingAttemptRef.current && canStart && streamRef.current) {
      resetSaveState();
      transcription.resetTranscription();
      audioAnalysis.resetAnalysis();
      startRecording(streamRef.current);
    }
  }

  function handleRetryPassage() {
    if (isRecording || isSavingAttemptRef.current) return;
    handleResetRecording();
  }

  function handleNextQuestion() {
    if (isRecording || isSavingAttemptRef.current) return;
    handleResetRecording();
    setIsPreviewComplete(false);
    setShowPhraseHelp(false);
    setShowStressHelp(false);
    nextQuestion();
  }

  function handleDisableMicrophone() {
    if (isRecording || isSavingAttemptRef.current) return;
    handleResetRecording();
    stopMicrophone();
  }

  return (
    <section className="practice-card" aria-labelledby="ra-title" aria-busy={isLoading}>
      <header>
        <p className="eyebrow">Reading + Speaking</p>
        <h2 id="ra-title">Read Aloud</h2>
      </header>
      {isLoading ? <p role="status">Loading Read Aloud…</p>
        : error ? <p role="alert">{error}</p>
          : !currentQuestion ? <p>No Read Aloud passages are available.</p>
            : (
              <>
                <p role="status">Question {currentIndex + 1} of {questions.length}</p>
                <p>Difficulty: {currentQuestion.difficulty}</p>
                <p>{currentQuestion.prompt}</p>
                <h3>Passage</h3>
                <RaPassage text={currentQuestion.transcript ?? currentQuestion.answer ?? ''} />
                <RaTrainingView
                  text={currentQuestion.transcript ?? currentQuestion.answer ?? ''}
                  phraseGroups={currentQuestion.phraseGroups} stressWords={currentQuestion.stressWords}
                  showPhraseHelp={showPhraseHelp} showStressHelp={showStressHelp}
                  onPhraseHelpChange={setShowPhraseHelp} onStressHelpChange={setShowStressHelp}
                />
                <p className="ra-preview-status" role="status">
                  {isPreviewComplete ? 'Ready to read aloud.' : 'Preview the passage silently before recording.'}
                </p>
                {!isPreviewComplete && (
                  <button type="button" onClick={() => setIsPreviewComplete(true)}>I'm ready to read</button>
                )}
                <MicrophonePanel
                  status={microphoneStatus} errorMessage={microphoneError}
                  onRequest={requestMicrophone} onDisable={handleDisableMicrophone} disableBlocked={isRecording || isSavingAttempt}
                />
                <RecorderPanel
                  status={recordingStatus} recording={recording} errorMessage={recordingError}
                  canStart={canStart} isFinalizing={isFinalizing} disabled={isSavingAttempt}
                  instruction="Preview the passage, then read it aloud when you are ready."
                  onStart={handleStartRecording} onStop={stopRecording} onReset={handleResetRecording}
                />
                <TranscriptionPanel
                  status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage}
                  hasRecording={recordingStatus === 'recorded' && !!recording} disabled={isRecording || isSavingAttempt}
                  onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage}
                  onTranscribe={handleTranscribe}
                />
                {content && ('error' in content ? <p role="alert">{content.error}</p>
                  : <RaContentResult comparison={content.comparison} metrics={content.metrics} />)}
                <section aria-labelledby="ra-audio-title" aria-busy={audioAnalysis.status === 'analysing'}>
                  <h3 id="ra-audio-title">Audio analysis</h3>
                  <button type="button"
                    disabled={recordingStatus !== 'recorded' || !recording || audioAnalysis.status === 'analysing' || isSavingAttempt}
                    onClick={() => void handleAnalyse()}>
                    {audioAnalysis.status === 'analysing' ? 'Analysing…' : 'Analyse audio locally'}
                  </button>
                  {audioAnalysis.errorMessage && <p role="alert">{audioAnalysis.errorMessage}</p>}
                </section>
                {fluency && <RaFluencyResult metrics={fluency.metrics} feedback={fluency.feedback}
                  longPauseMs={DEFAULT_READ_ALOUD_FLUENCY_CONFIG.longPauseMs} />}
                {audioAnalysis.result && <RaAudioAnalysisDebug result={audioAnalysis.result} />}
                <div className="ra-attempt-save" aria-busy={isSavingAttempt}>
                  <button type="button" onClick={() => void saveAttempt()}
                    disabled={!canSave || isSavingAttempt || !!savedAttemptId}>
                    {isSavingAttempt ? 'Saving…' : savedAttemptId ? 'Attempt saved' : 'Save attempt'}
                  </button>
                  <p>Save the detected transcript, content coverage and timing metrics locally.</p>
                  {savedAttemptId && (
                    <>
                      <p role="status">Attempt saved locally.</p>
                      <button type="button" onClick={handleRetryPassage} disabled={isRecording || isSavingAttempt}>
                        Retry same passage
                      </button>
                    </>
                  )}
                  {saveAttemptError && <p role="alert">{saveAttemptError}</p>}
                </div>
                <button type="button" onClick={handleNextQuestion} disabled={isRecording || isSavingAttempt}>Next passage</button>
              </>
            )}
    </section>
  );
}
