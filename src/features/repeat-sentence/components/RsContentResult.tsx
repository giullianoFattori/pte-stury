import type {
  RepeatSentenceComparisonResult, RepeatSentenceScoreResult, RsChunkAnalysis,
} from '../../../domain/scoring/repeat-sentence';

type Props = {
  comparison: RepeatSentenceComparisonResult;
  score: RepeatSentenceScoreResult;
  chunkAnalysis: RsChunkAnalysis | null;
  chunkError: string | null;
};

export function RsContentResult({ comparison, score, chunkAnalysis, chunkError }: Props) {
  return (
    <section className="rs-content-result" aria-labelledby="rs-content-title">
      <h3 id="rs-content-title">Content result</h3>
      <p role="status" className="rs-content-recall">Content recall: {score.contentRecallPercent}%</p>
      <p>Internal content metric, not an official PTE score. Recognizer errors can affect this feedback.</p>
      <p>This feedback does not measure pronunciation or oral fluency.</p>
      {score.exactContentMatch && <p>Exact content match.</p>}
      <dl className="wfd-result-summary">
        <div><dt>Correct words</dt><dd>{score.correctWords} / {score.expectedWords}</dd></div>
        <div><dt>Missing</dt><dd>{comparison.missingCount}</dd></div>
        <div><dt>Extra</dt><dd>{comparison.extraCount}</dd></div>
        <div><dt>Substitutions</dt><dd>{comparison.substitutionCount}</dd></div>
        <div><dt>Sequence retention</dt><dd>{score.sequenceAccuracyPercent}%</dd></div>
      </dl>
      <p>In this version, content recall and sequence retention both count words aligned in order.</p>
      {chunkAnalysis && (
        <>
          <h4>Chunks</h4>
          <p>Chunk retention: {chunkAnalysis.retainedChunks} / {chunkAnalysis.totalChunks} — {chunkAnalysis.chunkRetentionPercent}%</p>
          <ul className="rs-chunk-list">
            {chunkAnalysis.chunks.map((chunk) => (
              <li key={chunk.index}>
                <span>{chunk.retained ? 'Retained' : 'Partial / not retained'}: {chunk.text}</span>
                <span>{chunk.recallPercent}% ({chunk.correctWords} / {chunk.expectedWords} words)</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {chunkError && <p role="alert">{chunkError}</p>}
      <h4>Word feedback</h4>
      <div className="wfd-token-result">
        {comparison.tokens.map((token, index) => (
          <span key={index} className={`wfd-token wfd-token--${token.status}`}>
            {token.status === 'correct' && <>Correct: {token.expected}</>}
            {token.status === 'missing' && <>Missing: {token.expected}</>}
            {token.status === 'extra' && <>Extra: {token.actual}</>}
            {token.status === 'substitution' && <>Substitution: {token.actual} → {token.expected}</>}
          </span>
        ))}
      </div>
      <p><strong>Expected sentence:</strong> {comparison.expectedRaw}</p>
    </section>
  );
}
