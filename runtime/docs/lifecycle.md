# Runtime lifecycle — Activity 05.04

05.08 preserves the lifecycle and adds operational config ceilings, decoder fingerprint checks, shared bounded native execution with POSIX process groups/minimal environment, and conservative fatal/storage failure handling. Normal abort/timeout attempts SIGTERM, gives 100ms grace, then SIGKILL if needed; child close is awaited and remaining owned group members are killed. A fatal exception/rejection emits only a fixed code, attempts shutdown and exits nonzero (4s final deadline). No automatic engine/model/download/fallback/retry recovery is added. See [review evidence](security-review-05.08.md) and [residual risks](threat-model.md), especially actual cleanup failures, OS crash dumps, PID reuse and Windows child trees.

The Node.js ES-module runtime now implements metadata, audio ingestion and local
Whisper CLI transcription. It verifies models at startup and reloads the configured
model per CLI request. It does not launch the app or provide an installer. Start
with `npm run runtime:start`; test with
`npm run runtime:test` (system ffmpeg/ffprobe and loopback permission required).

## Startup and readiness

Startup validates the bounded runtime-owned config, detects platform/architecture,
binds exclusively to `127.0.0.1:<port>`, then initializes private temporary storage.
The listener holds audio requests behind storage initialization, then rejects them
with RUNTIME_STARTING until asynchronous engine initialization succeeds. Metadata
routes stay available while native verification runs. Invalid config, occupied
port and unsafe/unavailable temporary storage fail startup with fixed diagnostics
and exit 1. No alternate port or cloud fallback is selected.

Storage is `<system temp>/pte-study-runtime-<uid>/port-<port>/`. A private
`instance.lock/pid` identifies its owner. Acquisition is exclusive; an existing
lock is reclaimed only when the OS confirms that its PID no longer exists. A live
PID, permission ambiguity, PID reuse, symlinked root or invalid/incomplete lock
fails closed, requiring local operator repair for an ambiguous lock. The port bind
serializes competing starters; the namespace lock additionally survives listener
closure until active native work and cleanup finish. Different ports use isolated
namespaces and never clean each other's files.

With ownership acquired, startup scans at most 256 entries in its namespace and
removes only `request-<six alphanumeric characters>` entries. It unlinks symlinks
without traversing their targets. Other names, system-temp entries, POC samples and
question-bank assets remain untouched. Too many entries fail startup rather than
performing an unlimited scan. Locks contain operational process IDs, never audio.

After storage initialization, startup verifies the owned regular executable,
executable permission, pinned build version/commit, allowlisted model file/size
and streamed checksums. It executes the CLI on a generated one-second silence WAV
and cleans that WAV. Only successful loading/usability proof marks health ready.
Missing/invalid artifacts or failed usability produce error/unloaded health and
503 MODEL_UNAVAILABLE or RUNTIME_UNAVAILABLE; HTTP/version stay alive. No download
occurs. `model.loaded=true` means verified usable, not persistent residency.

Internal engineState transitions starting → ready/error and returns detached frozen
snapshots. HTTP cannot mutate state or choose native paths. Ordinary upload/decode,
no-speech, inference failure/timeout or busy errors do not alter ready health.
A genuine cleanup failure marks health `error` and blocks further audio ingestion;
no successful response is returned. Version metadata remains available.
Changed verified model/executable fingerprints also make health error/unloaded
and require restart/reverification. Model/engine verification is not retried by a
learner request; version remains independent of readiness.

## Audio request lifecycle

```text
trust / route / header validation
→ multipart boundary and Content-Length precheck
→ reserve the single slot
→ private generated request directory
→ streamed multipart to input.bin
→ inspect actual local container and audio stream
→ bounded decode to normalized.wav
→ verify WAV / mono / 16000 Hz / pcm_s16le / decoded duration
→ bounded whisper-cli on validated WAV with the same cancellation signal
→ validate raw UTF-8 transcript and response evidence
→ cleanup in finally
→ release slot
→ HTTP 200 transcript JSON if still connected
```

The slot covers upload, preprocessing, inference and cleanup, including failures.
Another valid upload gets `429 RUNTIME_BUSY` immediately, without temp/decode work
or an unbounded queue. Metadata requests remain responsive. The internal
preprocessing result contains a generated request ID, normalized path, duration in
integer milliseconds and verified sample properties; paths never reach HTTP.
The Whisper module consumes only normalized path, configured model ID and that
signal; it knows nothing about multipart, RA/RS, source passages or scoring.
Readiness is checked before receiving audio. Busy covers inference as well as
preprocessing; active work never flips ready health merely because it is active.

A ten-second HTTP body deadline bounds receipt. A separate 30-second deadline
covers all probes and conversion together. Inference uses the configured timeout
(60 s initially), including CLI model load. The total request controller budgets
10 s upload + 30 s preprocessing + inferenceTimeoutMs + 5 s overhead, initially
105 s. Transcribe sockets allow one further second; metadata idle sockets use
10 s. Config rejects inference timeouts exceeding the supported Node timer budget,
so a large value cannot overflow into immediate cancellation. Headers remain
bounded to five seconds. A preprocessing or inference deadline returns
`504 INFERENCE_TIMEOUT` with a fixed stage-specific safe message, using
the API v1 processing-timeout code. A stalled/disconnected upload may simply have
its connection closed; it cannot produce a stale result. Native stdout/stderr are
bounded independently to 64 KiB; raw process streams are never logged or directly
serialized. Only validated transcript text reaches the HTTP response.

## Temporary files and cancellation

On Linux, parent, namespace, lock and request directories are private (0700), with
input and normalized files created at 0600. A generated `request-XXXXXX` directory
contains fixed `input.bin` and `normalized.wav`; multipart filenames are ignored.
Storage paths are internal. Input creation is exclusive with no-follow flags where
supported. Roots are checked with lstat for directory type, owner and permissions.
Recursive removal only targets owned generated entries and does not follow links.
Windows/macOS permission and executable packaging behavior is not validated yet.

Client abort/disconnect and shutdown propagate through one AbortController to
stream receipt, probe, conversion and native Whisper inference (including startup).
Abort interrupts pending reads; native children are killed with SIGKILL and awaited until close before their
files are removed. No native stderr is exposed. Cleanup runs on validation failure,
decode/inference failure, timeout, disconnect and successful transcription. The concurrency
slot releases only after this cleanup attempt. A cancelled result is discarded.

SIGKILL/power loss can bypass finally; the next confirmed-owner startup removes
stale request directories. Audio is never retained by default. Unknown/unowned
entries are preserved, not treated as learner audio eligible for deletion.

## Shutdown and logs

SIGINT/SIGTERM stop new work and close the listener, abort active audio requests,
terminate owned native children, complete cleanup and then release the namespace
lock. Idle connections close immediately; a two-second timer destroys remaining
connections (including partial headers). Shutdown waits for request cleanup and
logs completion. Repeated signals are idempotent; clean shutdown exits 0 and
permits restart. Unexpected listener failure is sanitized and exits nonzero.

Fixed operational startup/shutdown and engine-initialization health/model/error
events are logged today. Future request logs may include generated request ID, status, byte count, duration and safe error
code. Never log raw media, multipart content, filename, native stderr, transcript,
expected answer, identity or arbitrary paths. Measured inference/total timings use
a monotonic clock, rounded to integer ms.
Total includes successful cleanup; inference includes model load. Text and all
metadata are validated before delivery; no confidence/timestamps are invented,
and scoring remains entirely in the app's TypeScript domain.

## CLI inference and response lifecycle

Each accepted request spawns the fixed trusted CLI with a fixed argument array:
model/file owned paths, language en, four threads, no GPU, no prints/timestamps,
suppression of non-speech tokens. No prompt, grammar, expected answer, previous
transcript or output-file flag exists. No model residency optimization is claimed.

Stdout contains controlled plain transcript text; diagnostic stderr is drained
without retention. Both streams are capped at 64 KiB. Invalid UTF-8, terminal
controls, timestamps, nonzero exit or cap overflow fail safely with INFERENCE_FAILED.
Outer whitespace is trimmed; punctuation and numeric representation are preserved.
Empty/blank-audio-only output is NO_SPEECH/422. Real ASR may still hallucinate or
misrecognize speech; that is a quality benchmark issue, not permission to send an
answer prompt. No transcript is written to disk or logged by default.

Deadline/disconnect kills the owned child and waits for close before deleting its
WAV. A child crash is request-level and recoverable on the next valid attempt.
Artifact fingerprints are checked before/after processing; changed trusted files
block subsequent readiness. Successful text/timings are passed through one response
builder with fixed engine/language/local claim and allowlisted model; all timings
must be non-negative safe integer ms and total must be at least inference. HTTP
serialization follows cleanup and cancellation checks. No stale success is sent.


## Browser integration implemented in 05.05

Open the UI independently of runtime startup. An explicit health check reports
ready/non-ready/incompatible/unreachable without installing browser language packs.
If runtime starts later, checking again recovers without reload. If it stops after
a ready check, transcription reports unavailable and keeps the recording. The
learner restarts/checks/retries explicitly; no automatic replay or fallback occurs.

The shared hook aborts health/transcription operations on reset/unmount and guards
state updates by mounted state and operation generation. Reset during native
inference was tested through the Vite proxy: the native call aborts and cleans up,
and stale success cannot update the new recording.

05.06 validates full RA/RS save/reset/navigation through real IndexedDB. A request
with exact digital silence exits after preprocessing as NO_SPEECH, with the same
finally cleanup and concurrency release; no Whisper child is started. General VAD
and learner accuracy remain later validation work.
