import { RsMicrophonePanel } from './components/RsMicrophonePanel';
import { RsSourceAudioPlayer } from './components/RsSourceAudioPlayer';
import { useMicrophonePermission } from './hooks/useMicrophonePermission';
import { useRepeatSentence } from './hooks/useRepeatSentence';

const difficultyLabels: Record<number, string> = { 1: 'Short', 2: 'Medium', 3: 'Long' };

export function RepeatSentencePage() {
  const { questions, currentQuestion, currentIndex, isLoading, error, nextQuestion } = useRepeatSentence();
  const { status, errorMessage, requestMicrophone, stopMicrophone } = useMicrophonePermission();

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
            <RsSourceAudioPlayer key={currentQuestion.id} audioUrl={currentQuestion.audioUrl} />
          ) : <p>Audio unavailable for this question.</p>}
          <RsMicrophonePanel status={status} errorMessage={errorMessage} onRequest={requestMicrophone} onDisable={stopMicrophone} />
          <button type="button" onClick={nextQuestion}>Next question</button>
        </>
      )}
    </section>
  );
}
