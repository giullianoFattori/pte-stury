import { WfdAnswerInput } from './components/WfdAnswerInput';
import { WfdAudioPlayer } from './components/WfdAudioPlayer';
import { useWriteFromDictation } from './hooks/useWriteFromDictation';

export function WriteFromDictationPage() {
  const {
    questions,
    currentQuestion,
    currentIndex,
    answer,
    isLoading,
    error,
    isSubmitted,
    updateAnswer,
    submitAnswer,
    nextQuestion,
  } = useWriteFromDictation();

  return (
    <section className="practice-card" aria-labelledby="wfd-title" aria-busy={isLoading}>
      <header>
        <p className="eyebrow">Listening + Writing</p>
        <h2 id="wfd-title">Write From Dictation</h2>
      </header>

      {isLoading ? (
        <p role="status">Loading Write From Dictation…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !currentQuestion ? (
        <p>No questions are available.</p>
      ) : (
        <>
          <p className="wfd-progress" role="status">
            Question {currentIndex + 1} of {questions.length}
          </p>
          <p>{currentQuestion.prompt}</p>

          {currentQuestion.audioUrl ? (
            <WfdAudioPlayer key={currentQuestion.id} audioUrl={currentQuestion.audioUrl} />
          ) : (
            <p>Audio unavailable for this question.</p>
          )}

          <WfdAnswerInput value={answer} onChange={updateAnswer} disabled={isSubmitted} />

          <div className="wfd-actions">
            {!isSubmitted ? (
              <button type="button" onClick={submitAnswer} disabled={!answer.trim()}>
                Submit
              </button>
            ) : (
              <>
                <p role="status">Answer captured. Scoring will be added in the next step.</p>
                <button type="button" onClick={nextQuestion}>
                  Next question
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
