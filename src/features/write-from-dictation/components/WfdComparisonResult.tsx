import type { WfdComparisonResult as ComparisonResult, WfdScoreResult } from '../../../domain/scoring/wfd';

type WfdComparisonResultProps = {
  result: ComparisonResult;
  score: WfdScoreResult;
};

export function WfdComparisonResult({ result, score }: WfdComparisonResultProps) {
  return (
    <section className="wfd-result" aria-labelledby="wfd-result-title">
      <h3 id="wfd-result-title">Result</h3>
      <dl className="wfd-score">
        <div>
          <dt>Word accuracy</dt>
          <dd>{score.wordAccuracyPercent}%</dd>
        </div>
      </dl>
      {score.exactMatch && <p>Exact word match.</p>}
      <dl className="wfd-result-summary">
        <div><dt>Correct words</dt><dd>{score.correctWords} / {score.expectedWords}</dd></div>
        <div><dt>Missing</dt><dd>{result.missingCount}</dd></div>
        <div><dt>Extra</dt><dd>{result.extraCount}</dd></div>
        <div><dt>Substitutions</dt><dd>{result.substitutionCount}</dd></div>
      </dl>
      <div className="wfd-token-result">
        {result.tokens.map((token, index) => (
          <span key={`${token.status}-${index}`} className={`wfd-token wfd-token--${token.status}`}>
            {token.status === 'correct' && <>Correct: {token.expected}</>}
            {token.status === 'missing' && <>Missing: {token.expected}</>}
            {token.status === 'extra' && <>Extra: {token.actual}</>}
            {token.status === 'substitution' && (
              <>Substitution: {token.actual} → {token.expected}</>
            )}
          </span>
        ))}
      </div>
      <p><strong>Correct sentence:</strong> {result.expectedRaw}</p>
    </section>
  );
}
