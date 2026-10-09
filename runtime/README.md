# PTE Local Speech Runtime — Activity 05.05

The production Node.js ES-module runtime now transcribes locally with the pinned
whisper.cpp v1.8.3 CLI and verified base.en weights. HTTP/runtime version remains
`0.1.0`, API `1`. It uses Node built-ins, system ffmpeg/ffprobe and an owned native
CLI, with no added npm runtime framework or cloud STT.

```text
MediaRecorder Blob → trusted loopback multipart → inspected audio
→ private mono 16 kHz PCM s16le WAV → whisper-cli → raw transcript
→ cleanup → validated JSON response
```

The shared React speech hook now defaults to the production
`WhisperCppSpeechToTextAdapter`. RA/RS use that hook and the runtime-aware panel.
Scoring, browser RA waveform analysis, reviews and IndexedDB schema remain unchanged.
Missing STT confidence is omitted from attempt metrics rather than stored as zero.

The client uses relative `/api/v1/health` and `/api/v1/transcribe` routes and the
domain's strict parsers/error mapping. Multipart contains only the original audio
Blob and `language=en`. No prompts, answers, question IDs or model choices are sent.
Reset/unmount abort health/transcription fetches and invalidate stale results.
There is no automatic retry or browser/cloud fallback. Runtime failures preserve
the recording for an explicit check and retry.

The browser adapter remains available for explicit developer injection, including
its regional language/install controls. The POC adapter remains development-only;
normal study routes do not import it. CLI-per-request still reloads the model.
Final model selection, packaging and launchers remain later work.

## React development workflow

Run from the repository root in two terminals:

```bash
# Terminal 1
npm run runtime:start

# Terminal 2
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite `/api/v1` proxy validates the incoming
Host, exact Origin and Fetch Metadata before rewriting Host/Origin for
`http://127.0.0.1:8765`. POST requires the exact Vite origin. Remote and null
origins are rejected before forwarding; there is no wildcard CORS. The trusted
development origin uses the actual bound Vite port, permitting explicit local
port overrides. A stopped runtime returns a safe `RUNTIME_UNAVAILABLE` response.
The application has no learner-editable runtime URL. Production remains intended
to serve UI and API from one local origin; Vite preview is not a runtime launcher.

## Start and smoke test

Tested on Linux x64 with installed Node 25.8.1, Ubuntu ffmpeg/ffprobe 6.1.1-3ubuntu5,
and the already-built POC native artifacts. Runtime startup does not build/download
anything. Development resource locations are resolved relative to this repository:

- `.local-runtime/whisper.cpp/build/bin/whisper-cli` (no PATH fallback);
- `.local-runtime/whisper.cpp/build/whisper-config.cmake` (pinned version/commit);
- `.local-runtime/models/ggml-base.en.bin` or `ggml-small.en.bin` (fixed allowlist).

These are internal development resources, not browser config or request fields.
Future packaged resources replace this resolver behind the same API. No binaries,
weights or learner recordings belong in Git. Windows/macOS packaging is untested.

From the repository root:

```bash
npm run runtime:start
# Or a strict runtime-owned config file, containing exactly the documented keys:
node runtime/src/main.mjs --config /path/to/runtime.json
```

The listener binds only `127.0.0.1:8765` by default. Health starts non-ready while
local initialization runs. A regular executable with executable permission, matching
build metadata, valid model size/checksums and a successful native startup check
are required before `ready` / `model.loaded: true`. The startup check uses a private
one-second synthetic-silence WAV; it proves loading/inference usability and discards
stdout. Model weights are reloaded by each subsequent CLI process; loaded does not
claim persistent residency.

Missing/corrupt model or unusable engine keeps HTTP alive with `health: error`,
`model.loaded: false` and a safe typed error. `/version` still works; transcribe
returns 503 MODEL_UNAVAILABLE or RUNTIME_UNAVAILABLE. No download/retry/fallback is
attempted. Restore trusted artifacts and restart to reverify. Invalid config,
occupied port or unsafe temporary storage instead fails process startup (exit 1).

```bash
curl http://127.0.0.1:8765/api/v1/health
curl http://127.0.0.1:8765/api/v1/version
ss -ltnp 'sport = :8765'
curl -i -H 'Origin: http://127.0.0.1:8765' \
  -F 'audio=@/path/to/recording.webm;type=audio/webm' \
  -F 'language=en' http://127.0.0.1:8765/api/v1/transcribe
```

With ready artifacts and usable speech, POST returns 200 with actual raw text,
`engine: whisper.cpp`, model ID, English language, processedLocally true and integer
`audioMs`, `inferenceMs`, `totalMs`. Runtime never receives the expected passage.
Empty native text is 422 NO_SPEECH. There is no fabricated confidence/timestamps.

POST requires the exact local Origin, including curl diagnostics. Host must be
127.0.0.1:<port>; metadata GET may omit Origin. No wildcard CORS or Vite-origin
bypass is added. The later preferred deployment serves React and API at one local
origin. Ctrl+C/SIGINT/SIGTERM cancel native work, await audio cleanup, release the
temp lock and close cleanly. The port is reusable after shutdown completes.

## Ownership and contract

| Browser / TypeScript app | Local runtime |
| --- | --- |
| Microphone permission, recording, playback, study state | Loopback HTTP, health/version and readiness |
| Requests, AbortSignal and stale-response rejection | Bounded audio validation, preprocessing, inference, cancellation |
| RA/RS comparison, chunk analysis, browser RA fluency | Native paths, model integrity and engine process ownership |
| Attempts, ErrorRecords, reviews, scheduler, future mastery | Private temp storage, normal/crash cleanup and privacy-safe logs |

Runtime returns transcription evidence only. It never decides correctness,
substitutions, PTE scores, mastery or scheduling. Browser SpeechRecognition remains
available temporarily but is deprecated as the primary direction. The POC adapter
remains development-only. The production frontend adapter is now the shared default;
there is no automatic browser fallback.

| Artifact | Responsibility |
| --- | --- |
| `src/server.mjs`, `main.mjs`, `config.mjs` | HTTP trust/routing, process signals, strict config |
| `src/engineState.mjs`, `health.mjs`, `version.mjs` | Controlled state transitions and read-only metadata snapshots |
| `src/multipart.mjs`, `media.mjs`, `preprocess.mjs` | Bounded parsing, actual container inspection and normalization |
| `src/whisper.mjs` | Owned resources, integrity/usability checks, fixed CLI invocation, bounded raw text |
| `src/audioRequest.mjs`, `temp.mjs`, `transcriptionGate.mjs` | Request cancellation, temp ownership/cleanup, slot spanning inference |
| `src/transcriptionResponse.mjs` | Validated local transcript/timing response |
| [docs/api.md](docs/api.md) | Durable wire contract, typed errors and domain mapping |
| [docs/lifecycle.md](docs/lifecycle.md) | Startup, readiness, deadlines, shutdown and cleanup |
| [docs/security.md](docs/security.md) | Origins, input bounds, native execution, privacy and artifact policy |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Verified source/license inventory; packaging obligations remain open |
| [runtimeTypes.ts](../src/domain/speech/runtimeTypes.ts) | Pure frontend/domain compatibility parsers and error mapping |

## Input, timeouts and privacy

Multipart contains exactly one audio file and language=en. Default total streamed
body limit is 12 MiB, decoded audio limit 180 seconds, concurrency one. Unknown,
duplicate or missing fields, URLs, prompts, model IDs/paths and flags are rejected.
MIME is an early gate; actual audio is inspected, including video rejection.
WAV/WebM recordings have been exercised on this Linux machine; Ogg/MP4 remain
allowlisted without a claim of validated Windows/macOS MediaRecorder output.

Preprocessing has a 30-second deadline. Whisper uses config.inferenceTimeoutMs,
initially 60 seconds, including model load. Total request budget includes 10 seconds
body receipt + preprocessing + inference + 5 seconds overhead (105 seconds by
default); POST socket deadline allows that work. Each native stdout/stderr stream
is capped independently at 64 KiB. Fixed argument arrays use shell:false, English,
four threads, CPU-only inference, no prompts/progress/timestamps/file outputs.

Private per-user/per-port storage is under system temp. Generated input/WAV files
are removed after native process termination in finally on every path. The slot
releases after cleanup. A private PID owner lock survives listener closure; startup
recovers only confirmed-dead owners and generated stale entries, without following
symlink targets or touching unrelated files. No raw audio or transcript is retained
by default. Runtime logs fixed lifecycle/model/state/error metadata, never transcript,
expected answer, native stderr, uploaded filename or private paths.

## Reproducible native baseline and integrity

Source baseline: whisper.cpp v1.8.3 revision
`2eeeba56e9edd762b4b38467bab96c2517163158`. The existing
[POC setup script](../tools/local-stt/scripts/setup-whisper.sh) records its reproducible
Release CPU build; its patch only changes the POC server, not the CLI used here.
The production resolver validates the build's version/commit metadata and then
actually runs the CLI. This is not complete executable/shared-library cryptographic
attestation; packaging must pin the full shipped artifact inventory.

A minimal intentional rebuild from the pinned checkout uses:

```bash
cmake -S .local-runtime/whisper.cpp -B .local-runtime/whisper.cpp/build \
  -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=OFF -DGGML_VULKAN=OFF
cmake --build .local-runtime/whisper.cpp/build --config Release --target whisper-cli -j 4
```

Verify the source revision before building. Model acquisition is separate from
runtime startup; use known official sources/tooling only. base.en requires exact
147,964,211-byte size, the documented SHA-1 and the verified SHA-256 in
[whisper.mjs](src/whisper.mjs). small.en uses a bounded size sanity range and its
known upstream SHA-1; it has not been downloaded or benchmarked here. Hashing is
streamed, and changed size/inode/timestamps invalidate the verified artifact before
or after inference. Model/engine changes require reinitialization, not silent use.

## Evidence and quality gates

[Activity 04.9 evidence](../tools/local-stt/RESULTS.md) remains preserved. Its synthetic
1.52% combined WER demonstrated the POC, not learner accuracy. No final model
selection until a real learner benchmark exists: at least five recordings with
manually verified spoken references remain pending, with 30+ across RA/RS preferred
for 05.07. Carry this gate into 05.10. Measure WER, latency/RTF, memory, CPU and size.

Actual 05.04 smoke observations on Linux CPU/base.en (2026-10-08):

| Controlled recording | Input | Audio ms | CLI ms | Total ms | Raw result observation |
| --- | --- | ---: | ---: | ---: | --- |
| RA-1 | prepared WAV / curl | 6705 | 2428 | 2633 | exact expected text |
| RS-1 | prepared WAV / curl | 2860 | 2355 | 2529 | nine → night (one substitution) |
| RA-1 | Chrome MediaRecorder WebM/Opus | 6660 | 2625 | 2866 | exact text, 0/17 edits |
| RS-1 | Chrome MediaRecorder WebM/Opus | 2820 | 2310 | 2514 | nine → 9 (one representation substitution in 6 words) |

All four returned 200 with real CLI transcripts; the TypeScript frontend parser
accepted them. Existing RA/RS comparison was exercised outside the runtime for
browser cases. Each request left no audio temp directory; socket audit showed
only 127.0.0.1:8765. WAV tests ran with runtime Node outbound APIs blocked and a
separate loopback curl client. Native tools use local-only paths/protocols; this
harness is not an OS-level network/process sandbox.

These are controlled synthetic recordings replayed into MediaRecorder, not human
learner validation. Observed numeric representation and recognition variation are
benchmark evidence, not reasons to prompt Whisper with an answer or patch scoring.
CLI-per-request measurements include model load; they do not establish final model
quality or performance. Confidence stays absent unless separately calibrated.

## Validation and next step

```bash
npm run runtime:test
npm test
npm run build
npm run lint
git diff --check
```

Normal automated tests need Node, ffmpeg/ffprobe and loopback permission, but no
model download. Native fault tests use an owned executable/model manifest fixture;
HTTP shell tests use an explicitly injected test engine. The production start
command never uses these fixtures or their test-only environment controls. Tests
cover model hash/size checks and usability, non-ready/ready/error health, failed
engine, CLI failure/overflow/deadline, disconnect/shutdown, recovery, busy gating,
wire parser compatibility, privacy and no-outbound instrumentation. Real engine
smokes above validate the actual local artifacts separately.

Next: 05.06 — Read Aloud + Repeat Sentence Migration Validation. Full task-level
persistence/error/review validation and POC cleanup remain there. No installer,
launcher or auto-download is implemented.

Validated 05.04: 213 tests passed, including 32 runtime tests, with no skips.
React build, lint and git diff checks passed. Existing POC/scoring/HTTP contract
tests remain green; real local CLI smoke observations are recorded above.


## 05.05 React integration validation

Automated adapter/client tests cover ready/non-ready/incompatible/unreachable
health, exact multipart fields and original MIME/bytes, safe error mapping, malformed
payloads, abort, busy, timeout, no speech and unsupported audio. Component tests
cover native controls/copy/retry and explicit browser language/install presentation.
Proxy integration tests use real local HTTP and hostile Host/Origin/Fetch Metadata.
RA/RS attempt tests accept Whisper results without invented confidence.

An optional real-Chrome suite exercises the actual React app, hook and production
runtime. It requires an independently installed Playwright module, Chrome, the
verified local native artifacts and controlled synthetic fixtures. It adds no
application dependency or downloaded model:

```bash
node tools/local-stt/scripts/create-controlled-samples.mjs
# If Playwright is installed as a package resolvable here:
npm run test:speech-browser
# Or point to an existing installation:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:speech-browser
```

`CHROME_PATH` can identify the trusted test browser executable. The suite owns
Vite on 127.0.0.1:5177 and runtime on 127.0.0.1:8765; those ports must be free.
Its microphone source is controlled Web Audio feeding a real MediaRecorder.
The harness for injected adapters is test-only HTML, absent from normal app routes.

Verified in Chrome on this Linux machine:
- RA recording/playback and browser audio analysis work with runtime stopped.
- Start/check without reload becomes ready; stop after check yields a safe
  unavailable message and preserves recording; restart/check/retry succeeds.
- RA returns the full 17-word passage and existing content comparison reports 100%.
- RS plays the source without revealing the answer, records and returns
  `Students must arrive before 9 tomorrow.`; existing content/chunk feedback renders.
  The `nine → 9` representation mismatch is preserved, not patched.
- Reset during real native inference aborts the signal, settles the engine call
  and suppresses stale text. A subsequent RS request succeeds.
- Actual hook tests cover checking/ready/transcribing/success/error, explicit retry,
  reset/check/unmount cancellation, late-result rejection and injected browser
  language/install behavior.
- Browser request audit contains only local requests; multipart has audio/language only.

Controlled observations from the recorded run (not a learner benchmark):

| Case | Model | audioMs | inferenceMs | totalMs | Raw text observation |
| --- | --- | ---: | ---: | ---: | --- |
| RA-1 | base.en | 6660 | 2267 | 2510 | Exact passage |
| RS-1 | base.en | 2820 | 2448 | 2660 | nine represented as 9 |

Real learner recordings and manually verified spoken references remain pending.
Carry that gate into 05.07/05.10; synthetic accuracy does not predict learner accuracy.
No final model selection is made here.


Validated 05.05: 223 automated tests passed (including the 32 runtime tests), with
no skips, plus the real-Chrome integration suite above. Build, lint and
`git diff --check` passed. No scoring formulas or database schema changed.
