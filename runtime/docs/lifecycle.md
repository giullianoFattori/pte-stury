# Runtime lifecycle contract

This policy is defined in 05.01; the production shell starts in 05.02 and audio/temp
implementation in 05.03. No launcher, auto-start, installer or model lifecycle is
implemented by these documents.

## Startup and readiness

Target product flow: launch PTE Study → start runtime → wait for compatible
`/api/v1/health` ready → open the browser at the single local origin.

Runtime startup order:

1. Validate runtime-owned configuration and reject non-loopback host, invalid
   limits, unknown settings and non-allowlisted models. Resolve pinned native
   artifacts and model storage internally; expose only versions/model ID.
2. Acquire the single-instance lock for the runtime-owned temporary namespace
   before scanning it. Reject symlinked/unowned roots; never delete another live
   runtime's files. Remove stale owned per-request directories from previous runs.
3. Bind only 127.0.0.1. Publish `/version` and non-ready `/health` metadata. Readiness
   checks must not download a model, change a model or perform inference.
4. Verify configured model integrity and initialize the pinned native engine.
   Report `starting` while initialization is in progress; report `error` with
   `MODEL_UNAVAILABLE` for missing, failed-integrity or unloadable weights.
5. Report `ready` only after the model and production inference path can accept
   transcription. Keep `processedLocally: true`; never substitute a remote engine.

05.02 has health/version but no production transcription or model loader. It must
not report `ready` simply because the listener is running. Report non-ready health
(for example, `error`, `model.loaded: false`, `MODEL_UNAVAILABLE`) until a later step
provides the actual prerequisites. `starting` represents work in progress, not an
indefinite promise that an unimplemented loader will finish. Version remains
available while the model is unavailable. `degraded` means unsafe/unusable for
inference and maps to native availability `error`.

## Request lifecycle and concurrency

```text
compatible + ready
→ reserve transcription slot
→ validate multipart / byte budget / language / decoded content
→ create private per-request directory with generated filenames
→ normalize to mono 16 kHz PCM s16le WAV
→ bounded local inference with active verified model
→ validate non-empty transcript + evidence
→ cleanup in finally
→ release slot
→ deliver response if still current/connected
```

One active transcription by default. The slot includes upload handling,
preprocessing, inference and cleanup; another request gets `RUNTIME_BUSY`/429
immediately. Health/version remain responsive during inference. There is no
unbounded queue, no browser-selected concurrency, and no implicit retry. Reject
bytes as they stream even if Content-Length is absent or false. Reject overlong
decoded audio, including durationless WebM, rather than truncating it into a false
learner response. Decoding/preprocessing must have its own bounded timeout and
resource policy when implemented; the configured 60000 ms inference timeout bounds
native inference separately. The request also needs bounded headers/body receipt
and a finite end-to-end timeout, including cleanup; exact shell timeout settings
belong to 05.02/05.03 and must never allow unbounded buffering or retention.

Return `INFERENCE_TIMEOUT`/504 on an inference deadline, stop/kill the owned native
work where supported, clean temporary files and release the slot only when native
work no longer owns them. A timeout must not launch a second worker while the first
is still running. Reinitialization failure moves health to error rather than ready.

## Cancellation and stale results

The future client passes AbortSignal to the request. An already aborted request
does no work. Abort/reset/question change/unmount invalidates the pending result
and produces domain `cancelled`; a network AbortError is not runtime unavailability.
Server disconnect detection stops reading input, cancels preprocessing and attempts
to interrupt native inference. If inference cannot be interrupted immediately, its
eventual text is discarded and it retains the concurrency slot until work stops.
Cleanup occurs after the last native reader releases the files. Never score or
persist a stale response; no HTTP cancellation response is required once the
connection has closed. Native cancellation capabilities are a later implementation
decision, not a capability claimed by 05.01.

## Temporary audio and crash recovery

Use one runtime-owned per-user temporary root (resolved internally, outside tracked
source), private permissions, and one isolated directory per request. Root/request
directories are mode 0700; audio files mode 0600 on Linux. Filenames are generated,
not derived from multipart filenames, URLs, question IDs or learner identity.
Delete input, normalized WAV, output/intermediate files and the request directory
in `finally` on success, validation failure, timeout, disconnect or cancellation.
No learner audio retention by default. Cleanup failure must prevent success and
mark health degraded/error; do not log raw audio or filesystem paths to the UI.

SIGKILL/power loss can bypass normal cleanup. On next startup, after obtaining
exclusive namespace ownership, scan only known runtime-owned stale request entries.
Check ownership and names with no symlink traversal; never scan arbitrary system
temporary directories or remove user files. A test corpus supplied by the developer
is not a temporary runtime file and must not be deleted. 05.03 implements/test-drives
normal and stale cleanup; packaging later determines the precise temp root.

## Shutdown

Target launcher exit or SIGINT/SIGTERM:

1. Mark runtime non-ready and stop accepting new transcription requests.
2. Drain or cancel the active request with a bounded grace period; discard stale
   output and stop owned native work before removing its inputs.
3. Complete normal temporary cleanup, release model/engine resources, close HTTP
   listener and release instance lock. Exit without retaining audio.

Forced termination may leave stale owned entries for next startup cleanup. Do not
kill unrelated processes, existing development servers or other users' runtimes.
The launcher is future work; the runtime shell must still implement graceful
startup/shutdown on its own in 05.02.

## Logs and timing

Allowed default log fields: timestamp, generated request ID, status, input bytes,
audio duration, active model ID, inference duration and typed error code. Use
bounded/rotated operational logs when file logging is introduced. No raw audio,
full learner transcript, expected answer, identity, arbitrary filenames/paths or
native stderr containing those values in default logs or learner-facing messages.
Native subprocess output needs filtering; suppress transcript output explicitly.
Debug logging cannot silently opt users into audio/transcript retention.

Integer milliseconds describe audio duration and processing wall time only, never
scores. Confidence remains undefined unless a separate calibrated contract is
established. Word timestamps stay optional; neither is required to make RA/RS
content comparison work.
