# 05.06 — Speaking migration validation

Primary STT is the production local whisper.cpp runtime. Browser STT is an
explicitly injectable legacy diagnostic only. Normal RA/RS neither instantiate
SpeechRecognition nor expose language-pack controls. Scoring, normalization,
ErrorRecord rules, review scheduling and IndexedDB schema remain unchanged.

Functional validation passes with controlled recordings. **Human validation is
still pending:** three real learner RA recordings and three real learner RS
recordings with manually verified spoken references are unavailable. The six TTS
cases below do not satisfy that human-speech gate. Do not mark the full human
validation or learner accuracy benchmark complete from these results. Carry the
corpus/quality gate into 05.07 and 05.10; no final model selection is made here.

## Reproduce

Normal development:

```bash
# Terminal 1
npm run runtime:start
# Terminal 2
npm run dev
```

Open http://127.0.0.1:5173. Ready health requires usable pinned engine/model,
model.loaded=true, engine=whisper.cpp and processedLocally=true.

Automated checks:

```bash
npm run runtime:test
npm test
npm run build
npm run lint
git diff --check
```

Optional Chrome suites require an existing Playwright installation, trusted Chrome,
ffmpeg/ffprobe and (for real mode) the verified native artifacts. They add no npm
dependency. Set PLAYWRIGHT_MODULE to that module's absolute index.mjs path if it
is not resolvable as the playwright package; CHROME_PATH can choose the test binary.

```bash
node tools/local-stt/scripts/create-controlled-samples.mjs
npm run test:speech-migration
npm run test:speech-migration -- --real --report
npm run test:speech-browser
```

Mock migration owns Vite on 127.0.0.1:5179. Real migration owns Vite on 5180 and
runtime on 8765. Recovery/abort smoke owns Vite on 5177 and runtime on 8765; run the
two native suites sequentially. Existing app servers are not stopped. Test browser
profiles/IndexedDB are isolated from the learner's normal profile.

The microphone source in these tests is controlled Web Audio/TTS feeding actual
MediaRecorder. Source playback, recorded playback, browser audio decode, React,
domain comparisons and IndexedDB persistence are real. Default migration mode
mocks only health/transcription HTTP and does not load Whisper. Real mode uses
the actual pinned native CLI and base.en; its JSON report contains controlled
transcripts/evidence only, never model binaries or recordings.

## Coverage and persistence

RA validates initial count/difficulty/passage, preview gate, phrase/stress aids,
microphone/recording/playback, native panel, detected text, unchanged content
comparison, independent browser audio segmentation and fluency display. Save is
disabled until transcription and browser audio analysis succeed. Persisted metrics
include content, latency, ending silence, active window, speech duration, interior
pauses, pause/long-pause counts, speech ratio and WPM. Missing confidence is absent.

RS validates source playback, record disabled while source plays, hidden expected
sentence before response, recording/playback, native text, content and chunk
feedback. Persisted score is contentRecall; chunk totals/retention are preserved.
The runtime receives exactly audio and language=en, never answer/chunks/item ID.

Both tasks:
- produce no Attempt merely from transcription;
- require explicit save and resist synchronous double-click duplication;
- preserve locally processed result text and expected task score;
- create only omission/insertion/substitution text errors, with the correct task
  skills and source Attempt/item linkage;
- create one linked sentence review for an imperfect response, none for a perfect
  response; no pronunciation/fluency error is inferred from text;
- roll back all three stores when inserting either an ErrorRecord or a ReviewItem
  fails, then recover through explicit save retry;
- clear recording/transcript/feedback/save state on retry; next also changes item
  and resets RA preview/helpers or RS source-player state.

A migration regression was exposed and fixed: RA retranscription after saving
retained the old savedAttemptId. RA now resets save state before explicitly
transcribing, matching RS. The previous persisted Attempt remains intact; the new
result needs explicit save. The browser regression would fail on the old behavior.

Busy, timeout, NO_SPEECH and unsupported-audio HTTP errors preserve the recording,
display safe mapped errors and prevent saving. A delayed A request is reset,
recording B succeeds, and late A cannot replace B. Navigation while a request is
active leaves a clean task. The separate native smoke validates runtime-off
recording/RA analysis, start-later check without reload, death-after-ready,
restart/retry, reset during actual inference, child cancellation and stale rejection.
The explicit browser diagnostic language/install flow remains tested.

WFD regression plays its source, submits the known answer, produces score=1,
persists its normal explicit outcome and clears state on next. It never calls STT.

## Silence failure discovered and fixed

Before the fix, a real request containing three seconds of all-zero PCM returned
200 with raw text "you". This would permit a false learner result. Normalized,
decoder-owned PCM WAV is now scanned using a bounded 32 KiB buffer; if **every PCM
sample is zero**, preprocessing returns 422 NO_SPEECH before spawning Whisper.
RIFF chunks are inspected only in trusted normalized output after codec/duration
validation. Metadata bytes do not count as signal.

This is a narrow empty-signal check, not VAD or pronunciation/scoring logic.
No amplitude threshold is introduced: even a single PCM sample with value 1
passes this check. Ambient noise, DC offsets and quiet/noisy silence may still
yield ASR hallucinations and require later learner/model/VAD investigation.

Regression tests prove silent WAV/WebM never reach inference, temp cleanup and
gate release, health remains ready, and a subsequent nonzero input succeeds.
The same silent WAV now returns 422 NO_SPEECH against the actual runtime. The
real-browser suite additionally records digital silence through MediaRecorder
and verifies no transcript/Attempt is produced.

## Controlled native observations

See [controlled-migration-results.json](controlled-migration-results.json) for
exact expected/raw text, scores, timings, saves and request audit from the measured
run. These are app content metrics, not learner WER or official PTE scores.

| Item | Task score | Errors | Reviews | audioMs | inferenceMs | totalMs | Observation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ra-001 | 100.00% | 0 | 0 | 6660 | 2504 | 2748 | Exact |
| ra-003 | 100.00% | 0 | 0 | 7320 | 2385 | 2594 | Exact |
| ra-006 | 94.74% | 1 | 1 | 9900 | 2359 | 2632 | behaviour → behavior |
| rs-001 | 83.33% | 1 | 1 | 2820 | 2120 | 2326 | nine → 9 |
| rs-003 | 100.00% | 0 | 0 | 3480 | 2357 | 2586 | Exact |
| rs-005 | 100.00% | 0 | 0 | 5940 | 2279 | 2510 | Capitalization only |

The observed spelling/representation mismatches were left visible:
- ra-006: behaviour becomes behavior, creating an aligned substitution.
- rs-001: nine becomes 9, creating an aligned substitution.
- rs-005: capitalization changes, which existing comparison already ignores.

All six Attempts were explicitly saved. The imperfect RA/RS responses each produced
one substitution ErrorRecord and one linked sentence ReviewItem. No fake confidence
was persisted. Real requests left no request-owned temp directory after response,
and runtime retains no transcript files. Only explicit frontend saves persist text.

Browser request audit reports zero remote requests and zero browser-STT calls.
Normal production build contains no SpeechRecognition or /__local-stt path.
The runtime's no-outbound, strict Host/Origin, limits, timeout, cleanup, busy,
graceful shutdown and port-collision tests remain in the regression suite.

## POC and activity status

Entry/page/POC adapter were archived from src/infrastructure/speech to
tools/local-stt/ui. TypeScript still checks them. The obsolete 8766 proxy was
removed from normal Vite; only the explicit dev:stt-poc command/config exposes it
on Vite port 5178. Activity 04.9 evidence and the pure evaluation utility remain
for reproducibility and possible 05.07 reuse. There is no normal learner route
depending on the archived UI/adapter.

Read Aloud functional infrastructure is validated with controlled speech.
Repeat Sentence is migrated to the same local pipeline. Full human-speaking
validation and learner-quality closure remain pending the six real recordings;
installer, packaging, mastery, benchmark and final model choice remain later work.


Final checks: 227 Node tests passed, including 33 runtime tests, with no skips.
Mock-HTTP/full-browser migration, six native controlled cases, native digital
silence, recovery/abort/shared-hook smoke and archived POC UI smoke passed.
Build, lint and git diff --check passed. Source searches found browser constructor
instantiation only in explicit legacy tests; native request logic sends en and
has no confidence fallback. No scoring/scheduler/database migration was made.
