# PTE Local Speech Runtime — Activity 05.03

Status: the real local HTTP runtime shell is implemented in Node.js ES modules,
using built-in HTTP, filesystem and JSON support with no framework or added npm
dependencies. Runtime version is `0.1.0`, API version `1`; the engine target is the
verified whisper.cpp `1.8.3` revision. No engine/model is loaded yet.

The runtime reports `status: starting`, `model.loaded: false` for both allowlisted
model choices. It serves health/version and bounded multipart audio ingestion. `/api/v1/transcribe`
validates and normalizes audio, cleans its files, then returns typed 503
`RUNTIME_STARTING`, never a fake transcript. React RA/RS remain unchanged. Model
download/loading, Whisper inference, launcher and packaging are not implemented.

## Start and smoke test

Tested with installed Node.js 25.8.1 on Linux x64. From the repository root:

```bash
npm run runtime:start
# Or supply a runtime-owned local file, with exactly the documented config keys:
node runtime/src/main.mjs --config /path/to/runtime.json
```

Default config is `runtime/config/runtime.example.json`, resolved relative to the
runtime source (independent of working directory). The file is read-only to the
shell; it is not a browser API. Configuration input is bounded to 16 KiB and must
be a regular valid JSON file. Unknown/missing keys, coercion, non-loopback hosts,
non-allowlisted models, invalid ports/limits and concurrency other than one fail
startup with exit code 1. An occupied port also exits 1 with `PORT_IN_USE`; no
alternate port is chosen and the existing process is not stopped.

In another terminal:

```bash
curl http://127.0.0.1:8765/api/v1/health
curl http://127.0.0.1:8765/api/v1/version
ss -ltnp 'sport = :8765'
```

Listener must be `127.0.0.1:8765`. Stop with Ctrl+C/SIGINT or SIGTERM: the shell
stops accepting connections, finishes metadata responses, closes idle connections,
and closes any remaining partial/slow connection after a two-second grace period.
It logs shutdown completion and exits cleanly, releasing the port for immediate
restart. It cancels active audio work, awaits child-process termination and cleanup, and
releases the temporary namespace lock after cleanup. Host is exactly `127.0.0.1:<port>`;
`localhost` and other hosts are rejected. Metadata Origin, when present, must match
`http://127.0.0.1:<port>`. There is no CORS allowlist or Vite integration yet; use curl
or the process integration tests for detection until frontend integration.

The [Activity 04.9 POC](../tools/local-stt/README.md) and its
[measured results](../tools/local-stt/RESULTS.md) remain intact. They proved local
inference with whisper.cpp v1.8.3 / base.en / CPU. They are not production code to
rename into this directory. Browser SpeechRecognition is deprecated as the primary
direction, but the current browser adapter and hook remain temporarily unchanged.
The POC adapter remains explicitly development-only and is not the default adapter.

## Ownership

```text
React / MediaRecorder
  → HTTP loopback /api/v1 (no answers or scoring inputs)
  → PTE Local Runtime: validate → preprocess → local Whisper → cleanup
  → transcription evidence
  → TypeScript RA/RS comparison, metrics, persistence and reviews
```

| Browser / TypeScript app | Native runtime |
| --- | --- |
| Microphone permission, recording, playback, study state | Loopback listener, health/version, compatibility metadata |
| Requests, AbortSignal and stale-response rejection | Audio validation, bounded preprocessing, timeout and concurrency |
| RA/RS comparison and chunk analysis, browser RA fluency | Model availability/integrity/loading and native inference |
| Attempts, ErrorRecords, ReviewItems, scheduler, future mastery | Isolated temporary audio, normal and crash cleanup, private logs |

The runtime returns text and processing evidence only. It never receives expected
passages, answer/chunk metadata, prompts or learner identity, and never decides
correctness, omissions, substitutions, PTE scores, mastery or scheduling.

## Repository boundary

| Path | Purpose |
| --- | --- |
| `runtime/src/` | HTTP/config/state plus multipart, audio lifecycle, temp ownership, media inspection, preprocessing and concurrency modules |
| `runtime/tests/` | Config/process/HTTP, actual media normalization, abuse limits, abort/deadline, stale/symlink cleanup and no-outbound instrumentation |
| [config/runtime.example.json](config/runtime.example.json) | Machine-independent example; strict read-only config loader implemented |
| [docs/api.md](docs/api.md) | Wire payloads, version gate, errors and domain mapping |
| [docs/lifecycle.md](docs/lifecycle.md) | Readiness, concurrency, cancellation, cleanup and logging |
| [docs/security.md](docs/security.md) | Binding, origins, bounded input and model provenance |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Baseline inventory and distribution obligations |
| [runtimeTypes.ts](../src/domain/speech/runtimeTypes.ts) | Transport-independent types, strict parsing and pure error/result mapping |
| [types.ts](../src/domain/speech/types.ts) | Domain engines and optional transcription evidence |
| `src/infrastructure/speech/runtimeClient.ts` | Future HTTP implementation; not created in 05.01 |
| `src/infrastructure/speech/WhisperCppSpeechToTextAdapter.ts` | Future native adapter; not created in 05.01 |

The future client/adapter validates health and API compatibility, posts audio,
parses the response, maps typed errors and honors AbortSignal. It knows neither RA
nor RS, and contains no executable path, model path, ffmpeg command or scoring.
The pure contract parsers do not make HTTP requests or execute native code.

## Availability migration

Native availability is `ready | starting | unavailable | incompatible | error`.
`unavailable` means unreachable; `incompatible` means wrong API/engine; `error`
includes malformed responses, degraded health and runtime errors. `ready` requires
compatible metadata, a loaded model, and the ability to transcribe safely now.
Health `starting` blocks inference until readiness; other non-ready statuses also
block inference. An HTTP 200 response alone is not a readiness decision.

The current `SpeechToTextAdapter.checkAvailability()` and shared hook retain the
browser-specific `available/downloadable/downloading/unavailable/unsupported` states.
Later integration will generalize that hook to native health without inventing an
`installLanguage()` workflow. The native adapter must not implement language-pack
installation. Browser fallback/diagnostic policy remains a separate later decision;
there is no cloud STT fallback.

## Configuration and versions

Configuration is runtime-owned, not browser-controlled. Initial values are loopback
IPv4, port 8765, base.en, 12 MiB upload, 180 seconds audio, 60 seconds inference,
one active transcription. Numeric limits must be positive safe integers; port is
1–65535. API is exactly 1; host is exactly 127.0.0.1; initially model selection is
an allowlist of base.en/small.en and concurrency is restricted to one. Future
changes to allowed host/model/backend choices require explicit runtime validation.
The loader must reject invalid values, unknown configuration keys and arbitrary
paths/URLs instead of silently weakening these settings. Do not run the POC
whisper-server and the future production listener on the same port.

Application version comes from the app build, runtime version from the native
artifact, API version from the protocol, engine version from the pinned native
build, and model ID from the loaded runtime model. They are independent; the app's
current package version is `0.0.0`, not the illustrative `0.8.0`. Runtime `0.1.0`
identifies this Node shell, not a bundled installer; engine `1.8.3` identifies its
pinned target, not a loaded model. Runtime/engine patch changes do
not change the API major when the wire contract remains compatible. Frontend API 1
must refuse inference on any other API version; it does not require an exact
runtime or engine patch version. Native sources/models stay pinned per artifact.

## Evidence and quality gates

No final model selection until a real learner benchmark exists. At least five real
learner recordings with manually verified **spoken** references remain pending;
30+ recordings across RA and RS are preferred for 05.07 Model Benchmark. Measure
WER, latency/RTF, peak memory, CPU and model size on the same corpus/configuration.
Carry the real learner gate into 05.10 Full Runtime Validation as well.

The POC's synthetic combined 1.52% WER demonstrates the technical path, not learner
accuracy. `nine → 9` remains a tracked normalization/benchmark issue; no scoring
normalization changes are made in 05.01. Existing LCS scoring and minimum-edit STT
WER remain separate. Confidence stays absent when not calibrated; timestamps are
optional. New optional domain model/timing fields are not persisted by this step,
and no Dexie schema/version, scoring or study-state change is required. Existing
attempt builders' historical missing-confidence metric fallback is not a calibrated
Whisper confidence value; its persistence/UI semantics must be reviewed before
production Whisper integration, without fabricating a confidence in the adapter.

## Verification and next step

```bash
npm run runtime:test
npm test
npm run build
npm run lint
git diff --check
```

Contract tests cover valid engines/metadata, incompatible API, typed error mapping,
local-only responses, invalid/finite/integer timing and the example config. POC tests
remain in the suite. No downloads or native builds are needed for the new contract
tests; existing POC loopback tests require permission to bind local ports.

05.01 validation remains recorded by its commit: 177 tests passed. Step 05.02 adds
runtime tests and [real HTTP contract integration tests](../tests/speech-runtime-http-contract.test.mjs),
included in `npm test`. Test children forbid outbound HTTP/HTTPS/fetch/TCP connections
and still serve valid health/version responses. Process tests cover strict config,
both Linux shutdown signals with partial connections, collision and immediate
restart. HTTP tests cover parsers, incompatible API/engine response fixtures, safe
routing, method/body rejection, malformed HTTP and Host/Origin/header-count checks.
POC evidence, browser adapters, scoring, attempt builders and database remain intact.

Validated on 2026-10-08: 190 tests passed with no skips (nine runtime tests and four
real HTTP integration tests added); app build, lint and diff checks passed. Default
port curl smoke tests returned valid non-cached starting health and Linux/x64
version metadata. `ss -ltnp` showed only `127.0.0.1:8765`. Manual Ctrl+C logged
shutdown completion and the next start bound the same port successfully; automated
direct-Node SIGINT/SIGTERM checks confirmed exit code 0 and restart with partial
connections. The npm development wrapper may report its own interrupted status
on Ctrl+C; runtime process signal handling is tested independently.

05.04 connects actual Whisper inference to the validated normalized WAV.
Model loading, inference and frontend migration remain later work. This shell's `starting` state never authorizes production transcription;
see [lifecycle](docs/lifecycle.md). Launcher and platform packages are not provided.


## Implemented audio ingestion (05.03)

Linux preprocessing uses installed `/usr/bin/ffmpeg` and `/usr/bin/ffprobe`
(6.1.1-3ubuntu5, GPL-enabled system build), not bundled product binaries. Runtime
HTTP/multipart code still uses Node built-ins without added npm dependencies.
Windows/macOS executable resolution and packaging are not validated in this step.

Multipart accepts exactly one `audio` file and `language=en`, with a mandatory
same-origin header. Default streamed total body budget is 12 MiB, decoded audio
limit 180 seconds, concurrency one. The parser writes incrementally to private
generated filenames. Container/stream inspection rejects unsupported, video,
non-audio and multi-stream inputs. Safe local argument-array conversion produces
WAV/mono/16 kHz/PCM s16le and probes its real duration/properties. The complete
preprocessing stage has a separate fixed 30-second deadline. Disconnect/deadline
stops owned native work and finally cleans files before releasing the slot.

Private storage is under system temp in `pte-study-runtime-<uid>/port-<port>/`.
Exclusive owner lock and startup stale recovery prevent removal of another live
instance's files. Only generated request directories qualify for recovery; symlink
targets and unrelated names are preserved. No retained audio by default. Exact
limits, codec gates, cancellation and lock policy are in [security](docs/security.md)
and [lifecycle](docs/lifecycle.md).

With the runtime started, this diagnostic passes a prepared local WAV:

```bash
curl -i -H 'Origin: http://127.0.0.1:8765' \
  -F 'audio=@/path/to/recording.wav;type=audio/wav' \
  -F 'language=en' http://127.0.0.1:8765/api/v1/transcribe
```

Expected after valid preprocessing: 503 with `RUNTIME_STARTING`. This is not STT
readiness or a transcript. Do not send expected passages/prompts. Expect headers
are explicitly unsupported; ordinary curl/FormData POSTs work.

05.03 evidence on Linux (2026-10-08): actual headless Chrome MediaRecorder generated
WebM/Opus (31,542 bytes in the final smoke run), accepted at the local POST origin and normalized to
1,980 ms of mono 16 kHz pcm_s16le WAV. A separate manual curl WAV upload passed.
Both returned only `RUNTIME_STARTING` after cleanup; no request audio remained.
`ss -ltnp` showed only 127.0.0.1:8765. Automated cases additionally cover controlled
WebM/Opus, prepared WAV, durationless WebM rejection, >180 s audio, streaming budgets,
strict multipart, malicious filenames, video/random/playlist bytes, concurrency,
upload/preprocessing abort, child timeout/termination, signal shutdown and stale
symlink-safe cleanup. Ogg/MP4 are planned/allowlisted, not claimed as validated
browser recordings on Windows/macOS. No actual learner-quality benchmark is added.

Final 05.03 validation: 203 tests passed (22 runtime tests), no skips; React build,
lint and git diff checks passed. Existing POC and contract integration tests remain
green. No model weights, compiled binaries or recording fixtures were committed.
