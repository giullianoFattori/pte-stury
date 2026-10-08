# Local speech API v1

This is the durable contract. Step 05.03 implements GET health/version and
POST transcribe through safe preprocessing, using the Node runtime. Valid audio
returns typed 503 RUNTIME_STARTING after cleanup; production inference is not wired.
The frontend requires
`apiVersion: 1`. Production preference is a single local origin serving the app at
`/` and API at `/api/v1/...`. Native implementation choices do not change these
payloads. JSON responses use `application/json`, `Cache-Control: no-store`, and
contain no native exceptions or filesystem paths.

## GET /api/v1/health

Returns HTTP 200 with readable health metadata even while starting/degraded/error;
clients must inspect the body and compatibility, not treat 200 as transcription
readiness. This route never triggers a model download or an inference.

```json
{
  "status": "ready",
  "runtimeVersion": "0.1.0",
  "apiVersion": 1,
  "engine": "whisper.cpp",
  "engineVersion": "1.8.3",
  "model": { "id": "base.en", "loaded": true },
  "processedLocally": true
}
```

Statuses are `starting | ready | degraded | error`. `ready` requires a verified,
loaded model and an implemented usable inference path; it cannot include an error.
Non-ready health may include `error: { code, message }` to explain the condition.
The 05.03 runtime deliberately remains `starting` with an unloaded configured model;
no background model loading is implied. `degraded` is not permission to transcribe.
Model ID is the configured identifier,
even before loading; `loaded` is a boolean, not an availability promise by itself.
An unreachable endpoint becomes client-side `unavailable`, not fabricated health.

## GET /api/v1/version

HTTP 200, available independently of model readiness:

```json
{
  "runtimeVersion": "0.1.0",
  "apiVersion": 1,
  "engine": "whisper.cpp",
  "engineVersion": "1.8.3",
  "build": { "platform": "linux", "arch": "x64" }
}
```

Runtime/engine versions are semantic version strings. Build platform identifiers
are `linux | win32 | darwin`, architectures `x64 | arm64`; these are metadata values,
not claims that platform packages already exist. The actual engine version must
describe the engine in the artifact. No paths, environment variables or executable
arguments are exposed. Changing runtime/engine patch version does not itself make
API 1 incompatible. Model identity is separate from these version numbers.

## POST /api/v1/transcribe

Multipart/form-data containing exactly one `audio` file and one `language` field
with value `en`. The browser lets FormData generate the multipart boundary. MIME
parameters such as `audio/webm;codecs=opus` are allowed; duplicate or unknown parts,
wrong language and malformed multipart are `INVALID_REQUEST`. No prompt, model,
expected text, answer, chunks, URL, file path or decoding flag fields are allowed.
Model choice belongs exclusively to validated runtime configuration.

Allowlisted input MIME types are `audio/webm`, `audio/ogg`, `audio/mp4`, and prepared
`audio/wav` (`audio/x-wav` alias). Content is inspected and decoded; MIME/extension
alone never establishes safety or compatibility. Accepted audio codecs depend on
the pinned preprocessing build and must be exercised on browser/platform outputs.
Video streams and unsupported/non-audio containers are rejected. Size includes the
multipart body: default 12 MiB maximum, enforced during streaming and independently
of Content-Length. Decoded duration maximum is 180 s; never silently truncate input.

The POST requires the exact trusted local Origin. Missing Origin is rejected;
metadata diagnostics remain origin-optional. All multipart bytes count toward the
limit, including chunked transfer. Boundary/header/field buffers are capped; unknown,
missing and duplicate fields fail closed. Expect: 100-continue is explicitly
unsupported (400); ordinary FormData/curl requests work. See [security](security.md).

In 05.03, valid WAV or WebM passes probe/conversion/decoded-duration validation,
then files are removed and HTTP 503 returns:

```json
{"error":{"code":"RUNTIME_STARTING","message":"Production transcription is not connected yet."}}
```

No normalized paths, transcripts, score or native output are returned. Empty audio
is 422 AUDIO_EMPTY; invalid decode is 422 AUDIO_DECODE_FAILED, unsupported actual
media is 415 AUDIO_UNSUPPORTED, byte/duration overflow is 413 AUDIO_TOO_LARGE,
concurrency is 429 RUNTIME_BUSY. A preprocessing deadline is 504 INFERENCE_TIMEOUT,
reusing the v1 processing-timeout code; no Whisper inference has occurred. Client
disconnect requires no response. Malformed uploads never make health ready/error.
Real cleanup failure blocks ingestion and changes health to error.

For future ready, compatible runtimes, successful HTTP 200:

```json
{
  "text": "The university library will remain open.",
  "language": "en",
  "engine": "whisper.cpp",
  "model": "base.en",
  "processedLocally": true,
  "timing": { "audioMs": 5940, "inferenceMs": 2211, "totalMs": 2447 }
}
```

`text` is non-empty raw decoded text; it is not normalized against any PTE answer.
Model IDs are opaque identifiers matching `[a-z0-9][a-z0-9._-]{0,63}`, never paths.
`processedLocally` must literally be true. All three timings are required,
non-negative finite safe integer milliseconds: decoded audio duration, inference
wall time (excluding preprocessing/model startup), and runtime request wall time
(including validation, preprocessing, inference and normal cleanup). Round to
nearest milliseconds; `totalMs >= inferenceMs`. Audio duration is independent of
processing wall time. Total excludes browser upload before the runtime receives the
request and browser playback. No confidence or word timestamps are invented.

No speech/empty decoded text is a typed error, not an empty successful transcript.
The strict parser rejects blank success text, non-local claims, unknown engines,
invalid model metadata and malformed timings as `INTERNAL_ERROR`. Additional
response fields can be additive within v1; parsers ignore them and reconstruct only
known fields. Request fields remain strict. Breaking required-field/meaning changes
require a new API version and new versioned routes.

## Errors and HTTP status

```json
{
  "error": {
    "code": "AUDIO_UNSUPPORTED",
    "message": "The recording format is not supported."
  }
}
```

Error codes are authoritative. Messages are sanitized diagnostics, not native
stderr; the frontend displays its fixed safe domain message after mapping the code.
Unknown codes, malformed bodies, or malformed success JSON become `INTERNAL_ERROR`;
the future client must not trust an HTTP status alone as success or infer a model
installation workflow from it. A success-shaped body on a non-success HTTP status
must be rejected. Health's optional error uses the same `{code,message}` type.

| Code | HTTP status | Domain `SpeechToTextError.code` |
| --- | --- | --- |
| RUNTIME_UNAVAILABLE | 503, or synthesized if unreachable | local-unavailable |
| RUNTIME_STARTING | 503 | local-unavailable |
| MODEL_UNAVAILABLE | 503 | local-unavailable |
| AUDIO_EMPTY | 422 | no-speech |
| AUDIO_TOO_LARGE | 413 (bytes or decoded duration) | recognition-failed |
| AUDIO_UNSUPPORTED | 415 | audio-track-unavailable |
| AUDIO_DECODE_FAILED | 422 | audio-track-unavailable |
| NO_SPEECH | 422 | no-speech |
| INFERENCE_TIMEOUT | 504 | recognition-failed |
| INFERENCE_FAILED | 500 | recognition-failed |
| REQUEST_CANCELLED | Client/disconnect synthesized; no response required | cancelled |
| RUNTIME_INCOMPATIBLE | Client synthesized; no inference request | unsupported |
| INTERNAL_ERROR | 500, or client synthesized for invalid response | recognition-failed |
| INVALID_REQUEST | 400 (including origin/Host rejection); 404 for unknown API route | recognition-failed |
| RUNTIME_BUSY | 429 | recognition-failed |

`INVALID_REQUEST` and `RUNTIME_BUSY` make malformed-request and concurrency failures
distinct from audio/inference errors. The initial runtime has one active request,
no hidden unbounded queue; excess submissions fail immediately with 429. Do not
automatically retry learner audio or fall back to any external service.

The runtime also returns `INVALID_REQUEST`/405 with `Allow: GET` (metadata) or
`Allow: POST` (transcribe) for wrong methods on registered routes, and 417 for unsupported HTTP expectations. It rejects
GET bodies and query inputs, and returns typed errors for malformed HTTP. Sensitive
POST trust checks happen before multipart receipt or decoder work.

## Domain mapping and future client order

1. Fetch health/version and validate the API version, engine and metadata. API != 1
   means `incompatible`, with message “Runtime version is incompatible with this app.”
2. Require health `ready`; never post audio for starting, degraded, error,
   unavailable or incompatible states. Handle readiness changing before submission
   using the typed error response.
3. Post only Blob audio and fixed language, honoring AbortSignal.
4. On a successful response, parse the wire shape and map nested timings to domain
   `audioMs`, `inferenceMs`, `totalMs`, plus engine/model/language/local/text metadata.
5. Leave confidence and words absent when unsupported. Discard stale/cancelled
   results before scoring or persistence, even if native work finishes later.

[runtimeTypes.ts](../../src/domain/speech/runtimeTypes.ts) defines these pure types,
parsers and mappers. `TranscriptionResult` permits browser-on-device and whisper.cpp,
optional model and timings; existing browser results remain valid without native
metadata. Optional domain timings, when supplied, obey the same integer/finite/
non-negative rules and total/inference relationship. These helpers are not an HTTP
client, server, adapter integration or persistence migration.
