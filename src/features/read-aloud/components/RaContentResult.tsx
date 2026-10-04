import type { ReadAloudComparisonResult, ReadAloudContentMetrics } from '../../../domain/scoring/read-aloud';

type Props = {
  comparison: ReadAloudComparisonResult;
  metrics: ReadAloudContentMetrics;
};

export function RaContentResult({ comparison, metrics }: Props) {
  return (
    <section className="ra-content-result" aria-labelledby="ra-content-title">
      <h3 id="ra-content-title">Content result</h3>
      <p className="ra-text-accuracy" role="status">Text accuracy: {metrics.textCoveragePercent}%</p>
      <p>Internal content metric, not an official PTE score. Recognizer errors can affect this feedback.</p>
      <p>Pronunciation and fluency are not measured yet.</p>
      {metrics.exactTextMatch && <p>Exact text match.</p>}
      <dl className="wfd-result-summary">
        <div><dt>Correct words</dt><dd>{metrics.correctWords} / {metrics.expectedWords}</dd></div>
        <div><dt>Omissions</dt><dd>{comparison.missingCount}</dd></div>
        <div><dt>Insertions</dt><dd>{comparison.extraCount}</dd></div>
        <div><dt>Substitutions</dt><dd>{comparison.substitutionCount}</dd></div>
      </dl>
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
    </section>
  );
}
