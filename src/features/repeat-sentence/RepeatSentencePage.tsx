import { useEffect, useMemo, useRef, useState } from 'react';

import { studyOutcomeRepository } from '../../data/repositories/studyOutcomeRepository';

import {
  analyseRepeatSentenceChunks, calculateRepeatSentenceMetrics, compareRepeatSentence,
  RsChunkMetadataError, type RsChunkAnalysis,
} from '../../domain/scoring/repeat-sentence';
import { tokenizeText } from '../../domain/scoring/shared/tokenizeText';

import { MicrophonePanel } from '../../shared/speech/components/MicrophonePanel';
import { RecorderPanel } from '../../shared/speech/components/RecorderPanel';
import { RsSourceAudioPlayer } from './components/RsSourceAudioPlayer';
import { RsTranscriptionPanel } from './components/RsTranscriptionPanel';
import { RsContentResult } from './components/RsContentResult';
import { useMicrophonePermission } from '../../shared/speech/hooks/useMicrophonePermission';
import { useAudioRecorder } from '../../shared/speech/hooks/useAudioRecorder';
import { useRepeatSentence } from './hooks/useRepeatSentence';
import { useSpeechTranscription } from './hooks/useSpeechTranscription';
import { buildRepeatSentenceAttempt } from './services/buildRepeatSentenceAttempt';
import { buildRepeatSentenceErrorRecords } from './services/buildRepeatSentenceErrorRecords';
import { buildRepeatSentenceReviewItems } from './services/buildRepeatSentenceReviewItems';

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
  const [isSourceAudioPlaying, setIsSourceAudioPlaying] = useState(false);
  const isRecording = recordingStatus === 'recording';
  const canStart = microphoneStatus === 'ready' && !isSourceAudioPlaying && !isRecording && !isSavingAttempt;
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

  function resetSaveState() {
    savedAttemptIdRef.current = null;
    setSavedAttemptId(null);
    setSaveAttemptError(null);
  }

  async function saveAttempt() {
    if (!isMountedRef.current || isSavingAttemptRef.current || savedAttemptIdRef.current
      || !currentQuestion || !recording || recordingStatus !== 'recorded'
      || transcription.status !== 'success' || !transcription.result
      || transcription.result.processedLocally !== true || !content || 'error' in content) return;
    isSavingAttemptRef.current = true;
    setIsSavingAttempt(true);
    setSaveAttemptError(null);
    try {
      const attempt = buildRepeatSentenceAttempt({
        question: currentQuestion, transcription: transcription.result,
        comparison: content.comparison, score: content.score,
        chunkAnalysis: content.chunkAnalysis, durationMs: recording.durationMs,
      });
      const errors = buildRepeatSentenceErrorRecords(attempt, content.comparison);
      const reviews = buildRepeatSentenceReviewItems({ question: currentQuestion, attempt, errors });
      await studyOutcomeRepository.createStudyOutcome({ attempt, errors, reviews });
      if (isMountedRef.current) {
        savedAttemptIdRef.current = attempt.id;
        setSavedAttemptId(attempt.id);
      }
    } catch (unknownError) {
      console.error('Failed to save RS attempt:', unknownError);
      if (isMountedRef.current) setSaveAttemptError('Your Repeat Sentence attempt could not be saved. Please try again.');
    } finally {
      isSavingAttemptRef.current = false;
      if (isMountedRef.current) setIsSavingAttempt(false);
    }
  }

  async function handleTranscribe() {
    if (isSavingAttemptRef.current || !recording || isRecording || isSourceAudioPlaying) return;
    resetSaveState();
    await transcription.transcribe(recording.blob);
  }

  function handleStartRecording() {
    if (!isSavingAttemptRef.current && canStart && streamRef.current) {
      resetSaveState();
      transcription.resetTranscription();
      startRecording(streamRef.current);
    }
  }

  function handleResetRecording() {
    if (isSavingAttemptRef.current) return;
    resetSaveState();
    transcription.resetTranscription();
    resetRecording();
  }

  function handleNextQuestion() {
    if (isRecording || isSavingAttemptRef.current) return;
    handleResetRecording();
    setIsSourceAudioPlaying(false);
    nextQuestion();
  }

  function handleRetrySentence() {
    if (isRecording || isSavingAttemptRef.current) return;
    handleResetRecording();
  }

  function handleDisableMicrophone() {
    if (isRecording || isSavingAttemptRef.current) return;
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
              disabled={isRecording || isSavingAttempt}
              onPlayingChange={setIsSourceAudioPlaying}
            />
          ) : <p>Audio unavailable for this question.</p>}
          <MicrophonePanel
            description="Repeat Sentence needs microphone access."
            status={microphoneStatus} errorMessage={microphoneError}
            onRequest={requestMicrophone} onDisable={handleDisableMicrophone} disableBlocked={isRecording || isSavingAttempt}
          />
          <RecorderPanel
            instruction="Enable the microphone and finish listening to the sentence before recording."
            status={recordingStatus} recording={recording} errorMessage={recordingError}
            canStart={canStart} isFinalizing={isFinalizing} disabled={isSavingAttempt}
            onStart={handleStartRecording} onStop={stopRecording} onReset={handleResetRecording}
          />
          <RsTranscriptionPanel
            status={transcription.status} result={transcription.result} errorMessage={transcription.errorMessage}
            hasRecording={recordingStatus === 'recorded' && !!recording} disabled={isRecording || isSourceAudioPlaying || isSavingAttempt}
            onCheck={transcription.checkAvailability} onInstall={transcription.installLanguage}
            onTranscribe={handleTranscribe}
          />
          {content && ('error' in content ? <p role="alert">{content.error}</p> : (
            <>
              <RsContentResult comparison={content.comparison} score={content.score}
                chunkAnalysis={content.chunkAnalysis} chunkError={content.chunkError} />
              <div className="rs-attempt-save" aria-busy={isSavingAttempt}>
                <button type="button" onClick={() => void saveAttempt()}
                  disabled={isSavingAttempt || !!savedAttemptId || transcription.result?.processedLocally !== true}>
                  {isSavingAttempt ? 'Saving…' : savedAttemptId ? 'Attempt saved' : 'Save attempt'}
                </button>
                {savedAttemptId && (
                  <>
                    <p role="status">Attempt saved locally.</p>
                    <button type="button" onClick={handleRetrySentence} disabled={isRecording || isSavingAttempt}>
                      Retry same sentence
                    </button>
                  </>
                )}
                {saveAttemptError && <p role="alert">{saveAttemptError}</p>}
              </div>
            </>
          ))}
          <button type="button" onClick={handleNextQuestion} disabled={isRecording || isSavingAttempt}>Next question</button>
        </>
      )}
    </section>
  );
}
