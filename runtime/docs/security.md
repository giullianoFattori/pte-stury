# Local runtime security and privacy — Activity 05.04

## HTTP trust boundary

Bind strictly to IPv4 `127.0.0.1`. Validate peer address, exact
`Host: 127.0.0.1:<configured-port>`, at most one Host/Origin header and Fetch Metadata
site (`same-origin` or `none`, when present). `localhost`, other ports, LAN/wildcard
hosts, null/external origins and cross-site requests receive fixed JSON errors.
Headers are capped at 8 KiB and 32 fields. Header-count truncation is disabled so
late headers cannot evade the explicit count/Origin checks.

GET health/version may lack Origin for diagnostics. POST transcribe **requires**
exact `Origin: http://127.0.0.1:<configured-port>`, including native curl diagnostics.
No wildcard/reflected CORS, Vite-origin bypass or remote-site client is supported.
The future preferred deployment serves React and `/api/v1` at this single local
origin. Vite proxy integration and frontend migration remain later work; the POC
proxy is unchanged. Loopback is not protection against malicious native software
already executing as the same user.

Exact routes only; query inputs are rejected. Unknown routes return typed 404,
wrong methods typed 405 with Allow, metadata bodies typed 400. Chunked uploads are
allowed only on POST transcribe. `Expect: 100-continue` is explicitly rejected with
400; other expectations with 417. Clients should send ordinary multipart POSTs.
Upgrades, CONNECT and malformed HTTP receive fixed JSON errors, never HTML/native
exceptions. Responses use no-store, nosniff and Connection close.

## Bounded multipart

The internal narrow parser accepts only one audio file and one `language=en` field,
in either order. No expected text, prompts, RA/RS answers, chunks, question IDs,
URLs, model IDs/paths, flags or executable paths are accepted. Unknown/duplicate,
missing, nested or malformed parts fail closed. Browser filenames are syntax only
and never used for a path, shell argument or log.

| Limit | Implemented value |
| --- | --- |
| Total streamed body, including multipart framing | Configured maxUploadBytes; initially 12 MiB |
| Boundary | 1–70 restricted ASCII characters |
| Parts | Exactly 2, unique allowlisted names |
| Per-part headers | 2 KiB, at most 4; only Content-Disposition/Content-Type |
| Field name | Fixed audio/language (maximum 8 characters) |
| Informational filename | 255 characters, ignored for storage |
| Language bytes | Exactly 2 ASCII bytes, en |
| Audio bytes | No more than configured total upload budget |
| Parser working window | 64 KiB slice + bounded header/delimiter tail |

Content-Length is checked before body work. Cumulative bytes are checked on each
stream read, including chunked requests. There is no whole-body audio allocation;
input is written incrementally with backpressure. Node receive chunks are bounded
by the request budget and sliced into the parser window. Stream/header deadlines,
one active slot and bounded decoder output also limit resource consumption.

## Media and native processes

Early MIME base allowlist: audio/webm, audio/ogg, audio/mp4, audio/wav, audio/x-wav;
parameters such as codecs=opus are accepted. MIME/extension is never evidence of
actual container/audio properties. Magic selects only WAV, Ogg, Matroska/WebM or
MOV/MP4; auto-detection of playlists/manifests is prohibited. Local ffprobe must
find exactly one audio stream, no video/data/subtitle/additional audio streams,
1–8 channels and a positive sample rate no higher than 192 kHz. Initial codecs:
Opus, Vorbis, AAC, FLAC and pcm_s16le/s24le/s32le/f32le/u8. These gates do not claim
all browsers/platforms have been tested.

Linux currently invokes trusted system `/usr/bin/ffprobe` and `/usr/bin/ffmpeg`
with fixed arrays, shell:false, stdin disabled and generated local paths. No
request can select tools or arguments. Tests can inject owned stubs through an
internal JavaScript option; this is not config or an HTTP feature. No model download
or arbitrary downloaded binary is used.

Both tools force the magic-selected allowlisted demuxer, permit only the file
protocol, cap probing to 1 MiB / five seconds of analysis, and bound individual
native allocations to 16 MiB. MOV external data references and absolute reference
paths are disabled. URL/playlist fields and playlist bytes are rejected before
native decoding. Network protocols (HTTP/HTTPS/TCP/etc.) are never allowlisted.
No outbound telemetry, cloud STT, remote media fetch or remote fallback exists.
Test runtime children additionally block Node outbound fetch/HTTP/HTTPS/TCP APIs.

Conversion maps only audio, disables video/subtitles/data, uses one encoding
thread, and produces mono 16 kHz PCM s16le WAV. The output is probed again for actual
properties and positive finite decoded duration. Declared duration, when available,
is an early reject, not the sole check. Durationless input is decoded at most one
second beyond maxAudioSeconds, with a second output-file byte cap large enough for
that interval. Any output over the acceptance limit is rejected, never returned as
an accepted truncated attempt. Default decoded maximum is 180 seconds.

A shared 30-second preprocessing deadline covers probes and conversion. Each
child's stdout/stderr is capped separately at 64 KiB; stderr is drained but never
retained/logged. Abort/deadline kills and awaits the owned child. These safeguards
bound work; they do not constitute OS-level isolation of the installed decoder.
Future packaging must pin and update the exact preprocessing artifact.

## Files, privacy and readiness

Private per-user/per-port temp namespaces, an exclusive owner lock, generated
request directories, finally cleanup and confirmed-dead-owner stale recovery are
implemented. Root symlinks/unowned/nonprivate roots fail closed; cleanup never
traverses symlink targets. See [lifecycle](lifecycle.md) for the exact stale-entry
policy and ambiguous-lock behavior. No learner recordings are retained by default.
A cleanup failure blocks audio requests and reports non-ready error health.

Microphone → browser → localhost → local preprocessing → local Whisper →
browser. No answer prompting, scoring or learner identity belongs to the runtime.
It becomes ready/usable only after engine/model verification and a native startup
check. Successful speech returns validated local transcript JSON after cleanup;
non-ready engines return typed 503. Bad uploads are isolated request errors. React RA/RS, scoring,
reviews and IndexedDB remain unchanged.

## Implemented engine/model ownership and integrity

Runtime exclusively owns model resolution, storage, source/checksum verification,
loading and active model choice. Browser sees only ID/readiness; config allows only
base.en/small.en. Verified POC baseline: whisper.cpp v1.8.3 revision
`2eeeba56e9edd762b4b38467bab96c2517163158`. Before readiness, the fixed CLI
path must be a regular executable, its build metadata must match this version and
commit, and a native synthetic-WAV check must prove loading/inference usability.

Development engine is resolved only from the repository's local pinned build;
there is no executable PATH fallback. Model IDs map to fixed ggml filenames under
.local-runtime/models. base.en requires exact size plus known SHA-1/SHA-256;
small.en requires bounded size sanity plus upstream SHA-1. Integrity hashing is
streamed and cancellation-aware; wrong/missing models never become ready. Startup
never downloads anything. Native path/model manifest injection exists only through
internal build/test JavaScript dependencies, not HTTP, config or production
runtime environment variables. Parent installation resources are trusted; final
model/build-info opens refuse symlinks where supported. Fingerprint checks detect
artifact replacement/modification before and after inference, and fail closed
until restart. This is not cryptographic attestation of every dynamic library;
packaging must pin/check the complete artifact bundle.

The CLI receives only a validated WAV, fixed owned model path and fixed English /
CPU / four-thread / quiet / no-timestamp / non-speech-suppression flags. It receives
no answer, prompt, chunk metadata, grammar or previous transcript. Stdout is
bounded plain text parsed with fatal UTF-8 validation; timestamp/control decoration
is rejected. Stderr is bounded/drained, never exposed. No output-file flag exists:
audio is temporary and transcripts remain in memory/HTTP only. Any native crash,
stream overflow, empty speech, deadline or cancellation follows the same cleanup
and concurrency guarantees as preprocessing. Timeouts account separately for
upload, preprocessing and inference (105 s default total, 60 s inference).

Pin sources/models and verify any intentionally downloaded artifacts before load;
never accept arbitrary URLs or paths from the browser. If whisper-server is used
internally later, keep its generic prompt/model/conversion endpoints private;
the product API is this runtime contract, not the POC server API. See
[POC provenance](../../tools/local-stt/README.md) and
[third-party inventory](../THIRD_PARTY_NOTICES.md). Distribution/installer work
must record complete pinned components, notices and reproducible builds.

The frontend must still validate API compatibility, local-only claims, timings and
safe typed errors; unknown errors never surface raw native messages. Incompatible,
cancelled or stale results must never be scored or persisted. Real learner quality
remains a pending benchmark gate; synthetic technical success is not learner WER.


## React transport implemented in 05.05

Browser requests use relative endpoints. The Vite development proxy has a fixed
loopback destination and validates the incoming Host against its bound
127.0.0.1 port, exact local Origin (mandatory for POST) and Fetch Metadata before
rewriting trusted headers to the runtime origin. Remote/null Origin, foreign Host,
cross-site Fetch Metadata and upgrades fail before forwarding. There is no
learner-editable URL or CORS wildcard. Runtime security checks remain unchanged.

The production client disallows redirects, sends only original Blob + language=en
and maps errors to static safe domain messages. It has no cloud/browser fallback
and no automatic retry. Browser abort propagates through the proxy's disconnected
response to runtime cancellation. Reset/unmount also reject late results locally.

## Exact digital silence (05.06)

After normalization/decoded-duration validation, a bounded scan of the
runtime-owned PCM data rejects all-zero digital silence as NO_SPEECH before
Whisper runs. This prevents the observed silent-input hallucination without
inventing confidence or implementing a speech/volume threshold. It is not general
VAD: ambient-noise/quiet-silence hallucinations remain a benchmark gate.
