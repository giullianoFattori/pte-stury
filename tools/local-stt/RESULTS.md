# Activity 04.9 — measured technical results

Validated on 2026-10-08 (Australia/Sydney) on this Linux development machine.
Native local inference is technically proven. Real learner accuracy remains pending;
the user confirmed no five-file real corpus exists and explicitly authorized
synthetic/controlled tests. Activity 04 is **not marked COMPLETE** on this evidence.
Activity 05 may proceed with the technical runtime direction; it must carry the
real learner quality gate forward. No final model selection was made.

## Environment and reproducibility

- AMD Ryzen 7 4800H, 8 physical cores / 16 threads; CPU inference, four threads.
- GCC 13.3.0; locally installed CMake 3.31.6; ffmpeg 6.1.1-3ubuntu5; Node 25.8.1.
- whisper.cpp v1.8.3 / `2eeeba56e9edd762b4b38467bab96c2517163158`, Release,
  CPU backend, no GPU, flash attention default enabled.
- `base.en` downloaded by the official script, SHA-1 matches upstream
  `137c40403d78fd54d454da0f9bd998f78703390c`.
- Downloaded model SHA-256:
  `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`.
- Pinned official server plus tracked POC restriction patch; no answer prompts;
  server's pinned `no_context` default is true. Browser adapter is unchanged.
- Server and Vite listener inspection showed `127.0.0.1:8765` and `127.0.0.1:5173`;
  bridge explicitly binds `127.0.0.1:8766`.

## Independent known WAV

The upstream `samples/jfk.wav` contains 11 seconds of speech, with 22 reference
words. Both modes returned:

> And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.

| Input | Model | Words | S | D | I | WER | Audio s | Inference s | RTF |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JFK CLI | base.en | 22 | 0 | 0 | 0 | 0.00% | 11.00 | 2.639 | 0.240 |
| JFK HTTP | base.en | 22 | 0 | 0 | 0 | 0.00% | 11.00 | 2.297 | 0.209 |

CLI includes process/model startup; HTTP uses an already loaded model. These are
single-run wall-clock observations, not a formal cross-model benchmark.

## Five controlled browser recordings

Synthetic speech was generated locally with ffmpeg/flite voice `slt`, using current
question-bank texts. Chrome decoded each WAV to an AudioContext stream and recorded
it through a real MediaRecorder (`audio/webm;codecs=opus`). The actual resulting Blob
was submitted through the development UI, Vite proxy, bridge, ffmpeg preprocessing
and whisper-server. This exercises the browser format/pipeline; it does not measure
microphone hardware, accents, learner mistakes or real room noise. References are
controlled generator text, not manually verified learner transcripts.

| Recording / item | Model | Words | S | D | I | WER | Audio s | Inference s | RTF | Total s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RA-1 / ra-001 | base.en | 17 | 0 | 0 | 0 | 0.00% | 6.66 | 2.179 | 0.327 | 2.377 |
| RA-2 / ra-005 | base.en | 20 | 0 | 0 | 0 | 0.00% | 9.90 | 2.237 | 0.226 | 2.463 |
| RS-1 / rs-001 | base.en | 6 | 1 | 0 | 0 | 16.67% | 2.82 | 2.177 | 0.772 | 2.367 |
| RS-2 / rs-003 | base.en | 9 | 0 | 0 | 0 | 0.00% | 3.48 | 2.112 | 0.607 | 2.312 |
| RS-3 / rs-005 | base.en | 14 | 0 | 0 | 0 | 0.00% | 5.94 | 2.211 | 0.372 | 2.447 |

Raw transcripts, references, byte sizes and exact measurements are retained in
[controlled-results.json](controlled-results.json), containing synthetic test text
only. All five completed; four had zero word edits. RS-1 produced `9` for `nine`,
a single substitution under the app's unchanged normalization. The acoustic content
may be equivalent, but current learner feedback treats it as an error. This is an
observed false-error risk to study in Activity 05, not grounds to change scoring here.
No insertions or deletions occurred in this controlled run. Combined WER was 1/66
(1.52%); this is not a prediction of learner accuracy.

RA raw transcripts flowed through `compareReadAloud()` and
`calculateReadAloudMetrics()`. RS flowed through `compareRepeatSentence()`,
`calculateRepeatSentenceMetrics()` and `analyseRepeatSentenceChunks()` with current
question chunks. The browser smoke test confirmed RS reference text was hidden
before submission and no external HTTP page requests occurred. Adapter/bridge
payloads contain only audio and fixed decoder fields, never expected/reference text.


Additional controlled RS-1 container checks used locally encoded files (not real
browser recordings). Both passed preprocessing and CLI inference:

| Container | Words | S | D | I | WER | Audio s | CLI s | RTF |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Ogg/Opus | 6 | 1 | 0 | 0 | 16.67% | 2.860 | 2.413 | 0.844 |
| MP4/AAC | 6 | 1 | 0 | 0 | 16.67% | 2.880 | 2.166 | 0.752 |

## Verification and limits

- Build/model load/known-WAV CLI and HTTP: passed.
- Five synthetic MediaRecorder WebM uploads, mono 16 kHz PCM s16le conversion,
  local inference, response parsing, RA/RS metrics and RS chunks: passed.
- Automated suite: 165 tests passed, no skips; build and lint passed with no warnings.
- Privacy: application inference endpoint is fixed loopback; native inference uses
  local weights. Source/model download is separate and uses network access.
- Cleanup: success and inference failure delete the entire temporary directory;
  invalid input, oversize, disallowed type/origin and control routes are tested.
  SIGINT/SIGTERM closes bridge connections to allow request cleanup; abrupt process
  death/power loss still requires crash cleanup in Activity 05.
- Production output contains no POC page or Whisper module; normal app adapter and
  domain types remain unchanged. No schema, scoring, error, scheduler, review or
  mastery changes were needed.
- `small.en` was not downloaded or measured. No CPU/memory comparison or final
  backend/model decision is claimed. Model-resident process memory is not a formal
  per-inference peak-memory measurement; that belongs to Activity 05.

## Closure gate

- [x] whisper.cpp compiled; base.en integrity checked and loaded
- [x] known WAV transcribed independently by CLI and HTTP
- [x] browser MediaRecorder format converted to compatible WAV
- [x] five controlled technical cases with actual accuracy/latency measurements
- [x] existing RA and RS comparisons/metrics/chunks exercised
- [x] loopback runtime, bounded requests and temporary cleanup
- [x] no scoring/mastery workaround; app build/lint/tests pass
- [ ] at least five **real learner recordings** with manually verified spoken references
- [ ] real learner WER/latency observations and remaining live speaking quality checks

Browser-native STT is deprecated as the primary direction. Native local Whisper
technical POC is validated. Activity 04 final learner-quality closure stays pending.
