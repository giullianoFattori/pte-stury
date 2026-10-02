import { useState } from 'react';

import { RsMicrophonePanel } from './components/RsMicrophonePanel';
import { RsRecorderPanel } from './components/RsRecorderPanel';
import { RsSourceAudioPlayer } from './components/RsSourceAudioPlayer';
import { useMicrophonePermission } from './hooks/useMicrophonePermission';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useRepeatSentence } from './hooks/useRepeatSentence';

const difficultyLabels: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Long' };

export function RepeatSentencePage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useRepeatSentence();
  const {
    status: microphoneStatus, errorMessage: microphoneError, streamRef, requestMicrophone, stopMicrophone,
  } = useMicrophonePermission();
  const {
    status: recordingStatus, recording, errorMessage: recordingError, isFinalizing,
    startRecording, stopRecording, resetRecording,
  } = useAudioRecorder();
  const [isSourceAudioPlaying, setIsSourceAudioPlaying] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = microphoneStatus === 'ready' && !isSourceAudioPlaying && !isRecording;

  function handleStartRecording() {
    if (canStart && streamRef.current) startRecording(streamRef.current);
  }

  function handleNextQuestion() {
    if (isRecording) return;
    resetRecording();
    setIsSourceAudioPlaying(false);
    nextQuestion();
  }

  function handleDisableMicrophone() {
    if (isRecording) return;
    resetRecording();
    stopMicrophone();
  }

  return (
    <section className="practice-card" aria-labelledby="rs-title" aria-busy={isLoading}>
      <header>
        <p className="eyebrow">Listening + Speaking</p>
        <h2 id="rs-title">Repeat Sentence</h2>
      </header>
      {isLoading ? (
        <p role="status">Loading Repeat Sentence…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !currentQuestion ? (
        <p>No Repeat Sentence questions are available.</p>
      ) : (
        <>
          <p role="status">Question {currentIndex + 1} of {questions.length}</p>
          <p>Difficulty: {currentQuestion.difficulty} — {difficultyLabels[currentQuestion.difficulty] ?? 'Practice'}</p>
          <p>{currentQuestion.prompt}</p>
          {currentQuestion.audioUrl ? (
            <RsSourceAudioPlayer
              key={currentQuestion.id}
              audioUrl={currentQuestion.audioUrl}
              disabled={isRecording}
              onPlayingChange={setIsSourceAudioPlaying}
            />
          ) : <p>Audio unavailable for this question.</p>}
          <RsMicrophonePanel
            status={microphoneStatus} errorMessage={microphoneError}
            onRequest={requestMicrophone} onDisable={handleDisableMicrophone} disableBlocked={isRecording}
          />
          <RsRecorderPanel
            status={recordingStatus} recording={recording} errorMessage={recordingError}
            canStart={canStart} isFinalizing={isFinalizing}
            onStart={handleStartRecording} onStop={stopRecording} onReset={resetRecording}
          />
          <button type="button" onClick={handleNextQuestion} disabled={isRecording}>Next question</button>
        </>
      )}
    </section>
  );
}
