import { useMemo, useState } from 'react';

import { compareReadAloud, calculateReadAloudMetrics } from '../../domain/scoring/read-aloud';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';

import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { TranscriptionPanel } from '../../shared/speech/components/TranscriptionPanel';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useSpeechTranscription } from '../../shared/speech/hooks/useSpeechTranscription';
import { RaContentResult } from './components/RaContentResult';
import { RaPassage } from './components/RaPassage';
import { RaTrainingView } from './components/RaTrainingView';
import { useReadAloud } from './hooks/useReadAloud';

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
  const [isPreviewComplete, setIsPreviewComplete] = useState(false);
  const [showPhraseHelp, setShowPhraseHelp] = useState(false);
  const [showStressHelp, setShowStressHelp] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = isPreviewComplete && microphoneStatus === 'ready' && !isRecording;

  const content = useMemo(() => {
    if (transcription.status !== 'success' || !transcription.result || !currentQuestion) return null;
    const expected = currentQuestion.transcript ?? currentQuestion.answer ?? '';
    const actual = transcription.result.text;
    if (!tokenizeText(expected).length) return { error: 'This passage has no usable expected text.' };
    if (!tokenizeText(actual).length) return { error: 'No usable detected speech is available.' };
    const comparison = compareReadAloud(expected, actual);
    return { comparison, metrics: calculateReadAloudMetrics(comparison) };
  }, [currentQuestion, transcription.status, transcription.result]);

  async function handleTranscribe() {
    if (!recording || recordingStatus !== 'recorded') return;
    await transcription.transcribe(recording.blob);
  }

  function handleResetRecording() {
    transcription.resetTranscription();
    resetRecording();
  }

  function handleStartRecording() {
    if (canStart && streamRef.current) {
      transcription.resetTranscription();
      startRecording(streamRef.current);
    }
  }

  function handleNextQuestion() {
    if (isRecording) return;
    handleResetRecording();
    setIsPreviewComplete(false);
    setShowPhraseHelp(false);
    setShowStressHelp(false);
    nextQuestion();
  }

  function handleDisableMicrophone() {
    if (isRecording) return;
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
                  onRequest={requestMicrophone} onDisable={handleDisableMicrophone} disableBlocked={isRecording}
                />
                <RecorderPanel
                  status={recordingStatus} recording={recording} errorMessage={recordingError}
                  canStart={canStart} isFinalizing={isFinalizing}
                  instruction="Preview the passage, then read it aloud when you are ready."
                  onStart={handleStartRecording} onStop={stopRecording} onReset={handleResetRecording}
                />
                <TranscriptionPanel
                  status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage}
                  hasRecording={recordingStatus === 'recorded' && !!recording} disabled={isRecording}
                  onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage}
                  onTranscribe={handleTranscribe}
                />
                {content && ('error' in content ? <p role="alert">{content.error}</p>
                  : <RaContentResult comparison={content.comparison} metrics={content.metrics} />)}
                <button type="button" onClick={handleNextQuestion} disabled={isRecording}>Next passage</button>
              </>
            )}
    </section>
  );
}
