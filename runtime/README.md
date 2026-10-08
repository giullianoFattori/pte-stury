# PTE Local Speech Runtime — Activity 05.01

Status: production contract and repository boundary defined; no production server,
model loader, transcription endpoint or launcher is implemented in this step.
The planned initial runtime version is `0.1.0`, API version is `1`. Example responses
describe the target contract; they are not live health checks.

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
| `runtime/src/` | Future native process implementation (reserved, currently empty) |
| `runtime/tests/` | Future native process and security tests (reserved, currently empty) |
| [config/runtime.example.json](config/runtime.example.json) | Machine-independent example; configuration loader belongs to 05.02 |
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
current package version is `0.0.0`, not the illustrative `0.8.0`. The planned native
`0.1.0` does not claim a released executable exists. Runtime/engine patch changes do
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
npm test
npm run build
npm run lint
git diff --check
```

Contract tests cover valid engines/metadata, incompatible API, typed error mapping,
local-only responses, invalid/finite/integer timing and the example config. POC tests
remain in the suite. No downloads or native builds are needed for the new contract
tests; existing POC loopback tests require permission to bind local ports.

Validated on 2026-10-08: all 177 tests passed (12 new contract tests), no skips;
production build, lint and diff whitespace checks passed. POC artifacts and all
scoring, attempt builders, review logic and database files were unchanged.

05.02 implements only the local HTTP shell, configuration loading, health/version,
graceful startup/shutdown and compatibility metadata. It does not implement
production transcription. A shell without a usable model/inference path must
report non-ready health; see [lifecycle](docs/lifecycle.md). Preprocessing and stale
temporary-file cleanup follow in 05.03. Launcher, packaging and platform binaries
remain later work.
