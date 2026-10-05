import type { ReadAloudFluencyMetrics } from '../../../domain/scoring/read-aloud';

type Props = { metrics: ReadAloudFluencyMetrics; feedback: string[]; longPauseMs: number };
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

export function RaFluencyResult({ metrics, feedback, longPauseMs }: Props) {
  return (
    <section className="ra-fluency-result" aria-labelledby="ra-fluency-title">
      <h3 id="ra-fluency-title">Fluency timing</h3>
      <p>Timing feedback is an internal practice measure. It is not an official Pearson PTE Oral Fluency score.</p>
      {metrics.hasSpeech && (
        <dl className="wfd-result-summary">
          <div><dt>Active reading</dt><dd>{seconds(metrics.activeWindowMs)}</dd></div>
          <div><dt>Speech</dt><dd>{seconds(metrics.speechDurationMs)}</dd></div>
          <div><dt>Interior pause duration</dt><dd>{seconds(metrics.interiorPauseDurationMs)}</dd></div>
          <div><dt>Speech ratio</dt><dd>{metrics.speechRatioPercent}%</dd></div>
          <div><dt>Pauses</dt><dd>{metrics.pauseCount}</dd></div>
          <div><dt>Long pauses</dt><dd>{metrics.longPauseCount}</dd></div>
          <div><dt>Average pause</dt><dd>{seconds(metrics.averagePauseMs)}</dd></div>
          <div><dt>Longest pause</dt><dd>{seconds(metrics.longestPauseMs)}</dd></div>
          <div><dt>Speech rate</dt><dd>{metrics.speechRateWpm === undefined ? 'Unavailable' : `${Math.round(metrics.speechRateWpm)} words/min`}</dd></div>
          <div><dt>Response latency</dt><dd>{seconds(metrics.responseLatencyMs)}</dd></div>
          <div><dt>Ending silence</dt><dd>{seconds(metrics.endingSilenceMs)}</dd></div>
        </dl>
      )}
      {feedback.map(message => <p role="status" key={message}>{message}</p>)}
      {metrics.hasSpeech && (
        <p>Long pauses are interior pauses of at least {longPauseMs} ms, an experimental practice threshold.
          Speech rate uses detected words over the active reading window, including pauses.</p>
      )}
      <p>Energy-based speech regions are approximate. Pronunciation is not measured yet.</p>
    </section>
  );
}
