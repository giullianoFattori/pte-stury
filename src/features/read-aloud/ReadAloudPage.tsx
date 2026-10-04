import { useState } from 'react';

import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
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
  const [isPreviewComplete, setIsPreviewComplete] = useState(false);
  const [showPhraseHelp, setShowPhraseHelp] = useState(false);
  const [showStressHelp, setShowStressHelp] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = isPreviewComplete && microphoneStatus === 'ready' && !isRecording;

  function handleStartRecording() {
    if (canStart && streamRef.current) startRecording(streamRef.current);
  }

  function handleNextQuestion() {
    if (isRecording) return;
    resetRecording();
    setIsPreviewComplete(false);
    setShowPhraseHelp(false);
    setShowStressHelp(false);
    nextQuestion();
  }

  function handleDisableMicrophone() {
    if (isRecording) return;
    resetRecording();
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
                  onStart={handleStartRecording} onStop={stopRecording} onReset={resetRecording}
                />
                <button type="button" onClick={handleNextQuestion} disabled={isRecording}>Next passage</button>
              </>
            )}
    </section>
  );
}
