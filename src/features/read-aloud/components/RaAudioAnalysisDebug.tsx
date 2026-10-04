import type { SpeechSegmentationResult } from '../../../domain/audio-analysis';

export function RaAudioAnalysisDebug({ result }: { result: SpeechSegmentationResult }) {
  const regions = [
    ...result.speechSegments.map(segment => ({ ...segment, label: 'Speech region' })),
    ...result.pauseSegments.map(segment => ({ ...segment, label: 'Pause region' })),
  ].sort((a, b) => a.startMs - b.startMs);
  return (
    <details className="ra-audio-analysis-debug">
      <summary>Segmentation details</summary>
      <p>Experimental energy-based regions may include noise or miss quiet speech.</p>
      <dl className="wfd-result-summary">
        <div><dt>Duration</dt><dd>{(result.durationMs / 1000).toFixed(2)} s</dd></div>
        <div><dt>Noise floor</dt><dd>{result.noiseFloorDb.toFixed(1)} dBFS-like</dd></div>
        <div><dt>Speech threshold</dt><dd>{result.thresholdDb.toFixed(1)} dBFS-like</dd></div>
        <div><dt>Speech regions</dt><dd>{result.speechSegments.length}</dd></div>
        <div><dt>Pause regions</dt><dd>{result.pauseSegments.length}</dd></div>
      </dl>
      <p>Digital relative levels, not room sound pressure or a fluency score.</p>
      <ol>
        {regions.map((region, index) => (
          <li key={index}>{region.label}: {(region.startMs / 1000).toFixed(2)}–{(region.endMs / 1000).toFixed(2)} s</li>
        ))}
      </ol>
    </details>
  );
}
