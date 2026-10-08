# Runtime lifecycle — Activity 05.03

The Node.js ES-module runtime now implements metadata and audio ingestion through
the normalized-WAV boundary. It does not load a model, invoke Whisper, launch the
app or provide an installer. Start with `npm run runtime:start`; test with
`npm run runtime:test` (system ffmpeg/ffprobe and loopback permission required).

## Startup and readiness

Startup validates the bounded runtime-owned config, detects platform/architecture,
binds exclusively to `127.0.0.1:<port>`, then initializes private temporary storage.
The listener holds audio requests behind initialization. Invalid config, occupied
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

Health stays `starting`, `model.loaded: false`. This does not imply background
model loading. A request-specific upload/decode error does not change health.
A genuine cleanup failure marks health `error` and blocks further audio ingestion;
no successful response is returned. Version metadata remains available. Later
05.04 must verify/load the model and provide usable inference before `ready`.

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
→ future inference boundary (not connected in 05.03)
→ cleanup in finally
→ release slot
→ 503 RUNTIME_STARTING if still connected
```

The slot covers upload, preprocessing and cleanup, including validation failures.
Another valid upload gets `429 RUNTIME_BUSY` immediately, without temp/decode work
or an unbounded queue. Metadata requests remain responsive. The internal
preprocessing result contains a generated request ID, normalized path, duration in
integer milliseconds and verified sample properties; paths never reach HTTP.
Step 05.04 can consume it before cleanup, with the same cancellation signal.

A ten-second HTTP body deadline and a 60-second end-to-end request timer bound
receipt. A separate 30-second deadline covers all probes and conversion together;
it does not use or consume the configured future inference timeout. Idle sockets
are capped at 65 seconds; headers remain bounded to five seconds. A preprocessing
deadline returns `504 INFERENCE_TIMEOUT` with a safe preprocessing message, reusing
the API v1 processing-timeout code. A stalled/disconnected upload may simply have
its connection closed; it cannot produce a stale result. Native stdout/stderr are
bounded independently to 64 KiB and never logged or returned.

## Temporary files and cancellation

On Linux, parent, namespace, lock and request directories are private (0700), with
input and normalized files created at 0600. A generated `request-XXXXXX` directory
contains fixed `input.bin` and `normalized.wav`; multipart filenames are ignored.
Storage paths are internal. Input creation is exclusive with no-follow flags where
supported. Roots are checked with lstat for directory type, owner and permissions.
Recursive removal only targets owned generated entries and does not follow links.
Windows/macOS permission and executable packaging behavior is not validated yet.

Client abort/disconnect and shutdown propagate through one AbortController to
stream receipt, probe, conversion and future inference. Abort interrupts pending
reads; native children are killed with SIGKILL and awaited until close before their
files are removed. No native stderr is exposed. Cleanup runs on validation failure,
decode failure, timeout, disconnect and successful preprocessing. The concurrency
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

Only fixed operational startup/shutdown events are logged today. Future request
logs may include generated request ID, status, byte count, duration and safe error
code. Never log raw media, multipart content, filename, native stderr, transcript,
expected answer, identity or arbitrary paths. No inference timing/confidence is
invented, and scoring remains entirely in the app's TypeScript domain.
