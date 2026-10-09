import { aggregate } from './metrics.mjs';

export function validateResult(result) {
  if (result.benchmarkVersion !== 1 || result.normalizationVersion !== 1 || !Array.isArray(result.samples)
    || !result.models || !result.hardware || !result.git || !result.engine || !result.config
    || !Number.isFinite(Date.parse(result.createdAt))) throw new Error('Invalid benchmark result/version.');
  const ids = new Set();
  for (const row of result.samples) {
    const key = `${row.id}:${row.model}`;
    if (ids.has(key) || !result.models[row.model] || !['ra', 'rs', 'noise'].includes(row.task)
      || !['ok', 'failed', 'excluded'].includes(row.status)) throw new Error('Invalid sample result.');
    ids.add(key);
    if (row.status === 'ok') {
      if (!Array.isArray(row.runs) || row.runs.length !== 3 || row.runs.some(run => run.status !== 'ok'
        || !Number.isFinite(run.inferenceMs) || run.inferenceMs < 0)) throw new Error('Three successful runs required.');
      if (!Number.isFinite(row.audioMs) || row.audioMs <= 0 || !Number.isFinite(row.rtf) || row.rtf < 0
        || !Number.isFinite(row.inferenceMs) || row.inferenceMs < 0) throw new Error('Invalid performance metrics.');
      if (row.task !== 'noise') {
        if (![row.referenceWords, row.S, row.D, row.I].every(n => Number.isSafeInteger(n) && n >= 0)
          || !row.referenceWords || row.wer !== (row.S + row.D + row.I) / row.referenceWords) throw new Error('Invalid WER metrics.');
      }
    }
  }
  return result;
}

export function summarize(result) {
  validateResult(result);
  const samples = result.samples.map(({ id, task, model, status, error, referenceWords, S, D, I, wer, audioMs,
    inferenceMs, totalMs, rtf, peakRssBytes, representationCount, transcriptVariants, hallucinatedWords, runs }) =>
    ({ id, task, model, status, error, referenceWords, S, D, I, wer, audioMs, inferenceMs, totalMs, rtf,
      peakRssBytes, representationCount, transcriptVariants, hallucinatedWords,
      runs: runs?.map(({ status, error, inferenceMs, rtf, peakRssBytes, referenceWords, S, D, I, wer, hallucinatedWords }) =>
        ({ status, error, inferenceMs, rtf, peakRssBytes, referenceWords, S, D, I, wer, hallucinatedWords })) }));
  const aggregates = Object.fromEntries(Object.keys(result.models).map(model => [model,
    Object.fromEntries(['overall', 'ra', 'rs'].map(task => [task, aggregate(samples.filter(row => row.model === model
      && ['ra', 'rs'].includes(row.task) && row.status !== 'excluded' && (task === 'overall' || row.task === task)))]))]));
  const completeIds = result.corpus.samples.filter(sample => sample.usable && sample.task !== 'noise'
    && Object.keys(result.models).every(model => samples.some(row => row.id === sample.id && row.model === model && row.status === 'ok')));
  const ra = completeIds.filter(row => row.task === 'ra').length, rs = completeIds.filter(row => row.task === 'rs').length;
  const includesBrazilianL1 = completeIds.some(row => row.l1 === 'pt-BR');
  const humanGate = ra >= 3 && rs >= 3 && includesBrazilianL1;
  return { benchmarkVersion: result.benchmarkVersion, normalizationVersion: result.normalizationVersion,
    createdAt: result.createdAt, git: result.git, engine: result.engine, hardware: result.hardware, models: result.models,
    config: result.config, corpus: result.corpus, samples, aggregates,
    gate: { completeRa: ra, completeRs: rs, includesBrazilianL1, humanGate, preferredCorpus: humanGate && ra >= 15 && rs >= 15,
      recommendation: humanGate ? 'provisional; human mismatch review and model decision pending' : 'pending; minimum human gate not met' },
    methodology: { quality: 'First chronological run, never best run; metrics for every repetition retained privately. Raw WER baseline.',
      failures: 'All failures retained; successful-only WER is incomplete when failures exist. Compare paired complete samples before a decision.',
      memory: 'Linux /proc VmHWM sampled every 10ms; lower bound; null means unavailable.',
      representation: 'Diagnostic one-token number/spelling substitution rules v1; raw WER unchanged.',
      privacy: 'No transcript, reference, speaker name, corpus path or machine path in summary.' } };
}

export function markdown(summary) {
  const format = value => value == null ? 'unavailable' : typeof value === 'number' ? String(Math.round(value * 10000) / 10000) : String(value);
  const lines = ['# Activity 05.07 — human speech benchmark', '', `Recommendation: **${summary.gate.recommendation}**.`, '',
    `Corpus: ${summary.corpus.samples.filter(row => row.usable && row.task !== 'noise').length} usable human recordings; ${summary.corpus.speakerCount} speakers.`,
    `Complete paired samples: RA ${summary.gate.completeRa}, RS ${summary.gate.completeRs}.`,
    `Git: ${summary.git.sha}; working tree ${summary.git.dirty ? 'dirty' : 'clean'}.`,
    `Engine: whisper.cpp ${summary.engine.version}, ${summary.engine.revision}; executable SHA-256 ${summary.engine.executableSha256}.`,
    `Hardware: ${summary.hardware.cpu}; physical cores ${format(summary.hardware.physicalCores)}; logical cores ${summary.hardware.logicalCores}; RAM ${summary.hardware.ramBytes} bytes; ${summary.hardware.os}, ${summary.hardware.arch}.`,
    `Build: ${summary.engine.buildType}; compiler ${summary.engine.compiler}; CPU backend, ${summary.config.threads} threads.`,
    '', '| Metric | ' + Object.keys(summary.models).join(' | ') + ' |', '| --- | ' + Object.keys(summary.models).map(() => '---').join(' | ') + ' |'];
  const metrics = [ ['Overall WER', (a) => a.overall.corpusWer], ['RA WER', a => a.ra.corpusWer], ['RS WER', a => a.rs.corpusWer],
    ['S / D / I', a => `${a.overall.S} / ${a.overall.D} / ${a.overall.I}`], ['Mean sample WER', a => a.overall.meanSampleWer],
    ['Median sample WER', a => a.overall.medianSampleWer], ['Worst sample WER', a => a.overall.worstSampleWer],
    ['Median inference ms (includes load)', a => a.overall.medianInferenceMs], ['Median RTF', a => a.overall.medianRtf],
    ['Median peak RSS bytes (sampled)', a => a.overall.medianPeakRssBytes], ['Max peak RSS bytes (sampled)', a => a.overall.maxPeakRssBytes],
    ['Representation differences', a => a.overall.representationDifferences], ['Failed samples', a => a.overall.failures] ];
  for (const [label, fn] of metrics) lines.push(`| ${label} | ${Object.keys(summary.models).map(model => format(fn(summary.aggregates[model]))).join(' | ')} |`);
  lines.push(`| Model bytes | ${Object.values(summary.models).map(model => model.bytes ?? 'unavailable').join(' | ')} |`, '',
    'Normalization v1: existing POC NFKC, lowercase, apostrophe canonicalization, punctuation `. , ! ? ; : "` removal and whitespace tokenization. Number forms and regional spellings remain different in raw WER.', '',
    'Latency: three CLI launches per sample/model; median, including model load. Same normalized WAV and production decoding arguments. No text prompts. First repetition determines primary WER; all repetitions and transcript variation are retained locally.', '',
    'Human mismatch review is pending. Review private edit lists and recordings for content words, negation, numbers, academic terms, function words, regional spellings and accent patterns. Classify A genuine learner error, B STT error, C representation-only, D ambiguous; do not infer pronunciation or official PTE accuracy.', '',
    'Noise diagnostics (separate from WER):', '', '| Sample | Model | Status | Hallucinated words (first run) |', '| --- | --- | --- | --- |');
  for (const row of summary.samples.filter(row => row.task === 'noise')) lines.push(`| ${row.id} | ${row.model} | ${row.status} | ${row.hallucinatedWords ?? 'unavailable'} |`);
  lines.push('', 'Digital silence is rejected by production preprocessing before inference. Noise hallucinations require a follow-up VAD investigation; no amplitude threshold is introduced here.', '',
    'Model integrity:', '');
  for (const [id, model] of Object.entries(summary.models)) lines.push(`- ${id}: ${model.status === 'failed' ? 'unavailable / integrity failed' : `${model.bytes} bytes; SHA-1 ${model.sha1}; SHA-256 ${model.sha256}`}.`);
  lines.push('', 'Failures and exclusions:', '');
  for (const row of summary.samples.filter(row => row.status !== 'ok')) lines.push(`- ${row.id} / ${row.model}: ${row.status}, ${row.error ?? 'excluded'}.`);
  return lines.join('\n') + '\n';
}
