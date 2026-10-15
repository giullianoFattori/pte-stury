import { useMemo, useState } from 'react';

import { exerciseIdentity, type ExerciseProps } from '../study-session/types';
import { useExercisePersistence } from '../study-session/hooks/useExercisePersistence';
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
import { useReadAloudAudioAnalysis } from './hooks/useReadAloudAudioAnalysis';

export function ReadAloudExercise(props: ExerciseProps) {
  return <ReadAloudExerciseBody key={exerciseIdentity(props)} {...props} />;
}

function ReadAloudExerciseBody(props: ExerciseProps) {
  const { item: currentQuestion, mode, onNext, progress } = props;
  const persistence = useExercisePersistence(props);
  const { isSaving: isSavingAttempt, savedAttemptId } = persistence;
  const saveAttemptError = persistence.error
    ? persistence.error.code === 'SESSION_PROGRESS_CONFLICT' ? persistence.error.message
      : 'Your Read Aloud attempt could not be saved. Please try again.'
    : null;
  const locked = isSavingAttempt || persistence.isSessionSaved;
  const {
    status: microphoneStatus, errorMessage: microphoneError, streamRef, requestMicrophone, stopMicrophone,
  } = useMicrophonePermission();
  const {
    status: recordingStatus, recording, errorMessage: recordingError, isFinalizing,
    startRecording, stopRecording, resetRecording,
  } = useAudioRecorder();
  const transcription = useSpeechTranscription();
  const audioAnalysis = useReadAloudAudioAnalysis();
  const [isPreviewComplete, setIsPreviewComplete] = useState(false);
  const [showPhraseHelp, setShowPhraseHelp] = useState(false);
  const [showStressHelp, setShowStressHelp] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = isPreviewComplete && microphoneStatus === 'ready' && !isRecording && !locked;

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

  async function saveAttempt() {
    if (persistence.isBlocked() || savedAttemptId || !canSave
      || !currentQuestion || !recording || !transcription.result || !content || 'error' in content || !fluency) return;
    const result = transcription.result;
    await persistence.saveOutcome(() => {
      const attempt = buildReadAloudAttempt({
        question: currentQuestion, transcription: result,
        comparison: content.comparison, contentMetrics: content.metrics,
        fluencyMetrics: fluency.metrics,
        longPauseThresholdMs: DEFAULT_READ_ALOUD_FLUENCY_CONFIG.longPauseMs,
        durationMs: recording.durationMs,
      });
      const errors = buildReadAloudErrorRecords(attempt, content.comparison);
      const reviews = buildReadAloudReviewItems({ question: currentQuestion, attempt, errors });
      return { attempt, errors, reviews };
    });
  }

  async function handleAnalyse() {
    if (persistence.isBlocked() || !recording || recordingStatus !== 'recorded') return;
    await audioAnalysis.analyse(recording.blob);
  }

  async function handleTranscribe() {
    if (persistence.isBlocked() || !recording || recordingStatus !== 'recorded') return;
    persistence.reset();
    await transcription.transcribe(recording.blob);
  }

  function handleResetRecording() {
    if (persistence.isBlocked()) return;
    persistence.reset();
    transcription.resetTranscription();
    audioAnalysis.resetAnalysis();
    resetRecording();
  }

  function handleStartRecording() {
    if (!persistence.isBlocked() && canStart && streamRef.current) {
      persistence.reset();
      transcription.resetTranscription();
      audioAnalysis.resetAnalysis();
      startRecording(streamRef.current);
    }
  }

  function handleRetryPassage() {
    if (isRecording || persistence.isBlocked()) return;
    handleResetRecording();
  }

  function handleNextQuestion() {
    if (isRecording || persistence.isBlocked()) return;
    handleResetRecording();
    setIsPreviewComplete(false);
    setShowPhraseHelp(false);
    setShowStressHelp(false);
    if (mode?.kind !== 'session') onNext?.();
  }

  function handleDisableMicrophone() {
    if (isRecording || persistence.isBlocked()) return;
    handleResetRecording();
    stopMicrophone();
  }

  return (
    <section className="practice-card" aria-labelledby="ra-title" aria-busy={isSavingAttempt}>
      <header>
        <p className="eyebrow">Reading + Speaking</p>
        <h2 id="ra-title">Read Aloud</h2>
      </header>
      {progress && <p role="status">Question {progress.currentIndex + 1} of {progress.total}</p>}
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
        onRequest={requestMicrophone} onDisable={handleDisableMicrophone} disableBlocked={isRecording || locked}
      />
      <RecorderPanel
        status={recordingStatus} recording={recording} errorMessage={recordingError}
        canStart={canStart} isFinalizing={isFinalizing} disabled={locked}
        instruction="Preview the passage, then read it aloud when you are ready."
        onStart={handleStartRecording} onStop={stopRecording} onReset={handleResetRecording}
      />
      <TranscriptionPanel
        provider={transcription.provider}
        language={transcription.language} onLanguageChange={transcription.changeLanguage}
        status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage}
        hasRecording={recordingStatus === 'recorded' && !!recording} disabled={isRecording || locked}
        onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage}
        onTranscribe={handleTranscribe}
      />
      {content && ('error' in content ? <p role="alert">{content.error}</p>
        : <RaContentResult comparison={content.comparison} metrics={content.metrics} />)}
      <section aria-labelledby="ra-audio-title" aria-busy={audioAnalysis.status === 'analysing'}>
        <h3 id="ra-audio-title">Audio analysis</h3>
        <button type="button"
          disabled={recordingStatus !== 'recorded' || !recording || audioAnalysis.status === 'analysing' || locked}
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
            {mode?.kind !== 'session' && (
              <button type="button" onClick={handleRetryPassage} disabled={isRecording || locked}>
                Retry same passage
              </button>
            )}
          </>
        )}
        {saveAttemptError && <p role="alert">{saveAttemptError}</p>}
      </div>
      {mode?.kind !== 'session' && onNext && (
        <button type="button" onClick={handleNextQuestion} disabled={isRecording || locked}>Next passage</button>
      )}
    </section>
  );
}
