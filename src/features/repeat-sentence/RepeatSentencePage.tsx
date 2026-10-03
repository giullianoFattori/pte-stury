import { useMemo, useState } from 'react';

import {
  analyseRepeatSentenceChunks, calculateRepeatSentenceMetrics, compareRepeatSentence,
  RsChunkMetadataError, type RsChunkAnalysis,
} from '../../domain/scoring/repeat-sentence';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';

import { RsMicrophonePanel } from './components/RsMicrophonePanel';
import { RsRecorderPanel } from './components/RsRecorderPanel';
import { RsSourceAudioPlayer } from './components/RsSourceAudioPlayer';
import { RsTranscriptionPanel } from './components/RsTranscriptionPanel';
import { RsContentResult } from './components/RsContentResult';
import { useMicrophonePermission } from './hooks/useMicrophonePermission';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useRepeatSentence } from './hooks/useRepeatSentence';
import { useSpeechTranscription } from './hooks/useSpeechTranscription';

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
  const transcription = useSpeechTranscription();
  const [isSourceAudioPlaying, setIsSourceAudioPlaying] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = microphoneStatus === 'ready' && !isSourceAudioPlaying && !isRecording;
  // Derive feedback from the current successful transcript: resetting STT also clears all results.
  const content = useMemo(() => {
    if (transcription.status !== 'success' || !transcription.result || !currentQuestion) return null;
    const actual = transcription.result.text;
    if (!tokenizeText(actual).length) return { error: 'No usable detected speech is available for content comparison.' };
    const expected = currentQuestion.transcript ?? currentQuestion.answer ?? '';
    if (!tokenizeText(expected).length) return { error: 'Content feedback is unavailable: this question has no usable expected sentence.' };
    const comparison = compareRepeatSentence(expected, actual);
    const score = calculateRepeatSentenceMetrics(comparison);
    let chunkAnalysis: RsChunkAnalysis | null = null;
    let chunkError: string | null = null;
    try {
      chunkAnalysis = analyseRepeatSentenceChunks(comparison, currentQuestion.chunks ?? []);
    } catch (error) {
      chunkError = error instanceof RsChunkMetadataError ? error.message : 'Chunk feedback is unavailable.';
    }
    return { comparison, score, chunkAnalysis, chunkError };
  }, [currentQuestion, transcription.status, transcription.result]);

  function handleStartRecording() {
    if (canStart && streamRef.current) {
      transcription.resetTranscription();
      startRecording(streamRef.current);
    }
  }

  function handleResetRecording() {
    transcription.resetTranscription();
    resetRecording();
  }

  function handleNextQuestion() {
    if (isRecording) return;
    handleResetRecording();
    setIsSourceAudioPlaying(false);
    nextQuestion();
  }

  function handleDisableMicrophone() {
    if (isRecording) return;
    handleResetRecording();
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
            onStart={handleStartRecording} onStop={stopRecording} onReset={handleResetRecording}
          />
          <RsTranscriptionPanel
            status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage}
            hasRecording={recordingStatus === 'recorded' && !!recording} disabled={isRecording || isSourceAudioPlaying}
            onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage}
            onTranscribe={async () => { if (recording && !isRecording && !isSourceAudioPlaying) await transcription.transcribe(recording.blob); }}
          />
          {content && ('error' in content ? <p role="alert">{content.error}</p> : (
            <RsContentResult comparison={content.comparison} score={content.score}
              chunkAnalysis={content.chunkAnalysis} chunkError={content.chunkError} />
          ))}
          <button type="button" onClick={handleNextQuestion} disabled={isRecording}>Next question</button>
        </>
      )}
    </section>
  );
}
