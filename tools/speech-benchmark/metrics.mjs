export { measureWordErrors, BENCHMARK_NORMALIZATION_VERSION } from '../../src/infrastructure/speech/benchmarkWordErrors.ts';

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Diagnostic only: raw WER retains every one of these substitutions.
const equivalents = new Map(Object.entries({ behaviour: 'behavior', organisation: 'organization', colour: 'color',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', twenty: '20' }));
export function representationDifferences(metrics) {
  return metrics.substitutions.filter(({ expected, actual }) => expected !== actual
    && (equivalents.get(expected) ?? expected) === (equivalents.get(actual) ?? actual));
}

export function aggregate(rows) {
  const complete = rows.filter(row => row.status === 'ok');
  const sum = key => complete.reduce((total, row) => total + row[key], 0);
  const referenceWords = sum('referenceWords'), S = sum('S'), D = sum('D'), I = sum('I');
  return { samples: rows.length, measuredSamples: complete.length, failures: rows.length - complete.length,
    referenceWords, S, D, I, corpusWer: referenceWords ? (S + D + I) / referenceWords : null,
    meanSampleWer: complete.length ? sum('wer') / complete.length : null,
    medianSampleWer: median(complete.map(row => row.wer)), worstSampleWer: complete.length ? Math.max(...complete.map(row => row.wer)) : null,
    representationDifferences: sum('representationCount'),
    medianInferenceMs: median(complete.map(row => row.inferenceMs)), medianRtf: median(complete.map(row => row.rtf)),
    medianPeakRssBytes: median(complete.filter(row => row.peakRssBytes !== null).map(row => row.peakRssBytes)),
    maxPeakRssBytes: complete.some(row => row.peakRssBytes !== null) ? Math.max(...complete.filter(row => row.peakRssBytes !== null).map(row => row.peakRssBytes)) : null };
}
