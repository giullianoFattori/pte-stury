# Activity 05 — Step 07: model benchmark

Status: benchmark tooling implemented; **human comparison and model choice pending**.

The user confirmed that the human corpus is not available yet. Tooling validation passed: `npm test` (238 tests), `npm run runtime:test` (33 tests), `npm run build`, `npm run lint`, and `git diff --check`. `npm run benchmark:speech -- --init` initialized the ignored private corpus. `npm run benchmark:speech` correctly refuses measurement without usable recordings; no metrics were fabricated.

No verified human benchmark corpus was available in the workspace during implementation. Existing controlled/TTS migration tests prove the pipeline and do not satisfy the human gate. No empirical winner, accuracy, latency, RTF or RAM comparison is claimed. `base.en` remains the existing production baseline, not a newly validated model choice. RA/RS learner scoring is unchanged. Quantization is deferred until the full-model comparison gives a reason to test one candidate.

Use [the benchmark instructions](../../tools/speech-benchmark/README.md) and `npm run benchmark:speech`. Tooling supports the pinned whisper.cpp v1.8.3 baseline (`2eeeba56e9edd762b4b38467bab96c2517163158`) with base.en and small.en. It shares production preprocessing and decoding, uses human spoken references for WER, records three repetitions with load cost, S/D/I, weighted corpus/RA/RS WER, timing, RTF, sampled peak process memory, model hashes/bytes, hardware/build and Git identity. It preserves failed rows and separate noise diagnostics, and generates private raw JSON plus anonymous JSON/Markdown summaries.

| Metric | base.en | small.en |
| --- | --- | --- |
| Human recordings measured | 0 | 0 |
| Overall / RA / RS WER | pending | pending |
| S / D / I | pending | pending |
| Median latency / RTF | pending | pending |
| Peak process RAM | pending | pending |
| Model bytes / SHA-256 | captured on run | captured on run |
| False learner errors / representation review | pending | pending |

Phase A requires 3 real RA + 3 real RS recordings with manually verified actual speech, including a Brazilian Portuguese L1 learner. Document speaker count, microphone/room conditions, pace and task coverage with the first report. Six samples permit only a provisional recommendation. Phase B targets 15+ RA + 15+ RS recordings before a stronger final recommendation, with human review of false learner errors and representation differences. More speakers are needed before commercial release. Accuracy takes priority over latency, RAM, download size and operational complexity; no unsupported numerical acceptance threshold is imposed.

Raw recordings and reference/transcript reports remain in ignored `.local-benchmark/`. Publish only reviewed anonymous summaries to [the archive](benchmarks/benchmark-05.07-summary.md). Keep the base.en results even if another model later wins. Any real-noise hallucinations should open a VAD follow-up; the current production digital-silence gate remains unchanged.

The Step 05.07 human gate is still open. Step 05.08 resource decisions should use measured model costs once this corpus is available.
