# Local runtime security and privacy contract

05.02 implements the metadata-only listener with Node.js built-ins. The audio,
native inference and temporary-file requirements below remain for subsequent steps.

Current enforced boundary: validated IPv4 loopback binding; exact
`Host: 127.0.0.1:<configured-port>`; at most one Host/Origin header; Origin, if
present, must equal `http://127.0.0.1:<configured-port>`; Fetch Metadata site, if
present, must be `same-origin` or `none`. `localhost`, wildcard hosts, other ports,
external/null origins and cross-site requests receive typed `INVALID_REQUEST`/400.
No CORS headers are emitted. Vite/React direct access is not enabled in this step.

Only exact GET `/api/v1/health` and GET `/api/v1/version` are registered. Missing
Origin is allowed for these metadata diagnostics. Unknown routes (including
`/api/v1/transcribe`) and query strings return JSON 404; wrong methods on known
routes return 405 with `Allow: GET`. No unsupported method is accepted, even with
an absent Origin. Nonzero Content-Length or Transfer-Encoding on metadata GET is
rejected without consuming its body. Upload expectations, HTTP upgrades and CONNECT
are rejected; no body parser, audio buffer, filesystem write or native invocation
exists. Any bytes a caller sends are not accepted as learner input.

Headers are bounded to 8 KiB and 32 fields, with five-second header and ten-second
request/socket deadlines checked every second. Node's header-count truncation is
disabled so the explicit 32-field gate cannot overlook a late Origin header; the
independent byte limit remains active. Responses disable caching and keepalive;
malformed HTTP returns a fixed typed JSON error. No raw packet/header/URL/body or
native exception logging. Test children block outbound fetch/HTTP/HTTPS/TCP APIs
and still pass health/version and process lifecycle tests.

## Listener and origins

Bind strictly to `127.0.0.1`. IPv6 `::1` may be added later with explicit validation;
the initial config accepts only IPv4 loopback. Reject wildcard/LAN hosts, rather
than interpreting `0.0.0.0` as a convenient development setting. Fail on an occupied
port; do not silently bind a different/public interface. Never grant network access
based only on an untrusted Host header or assume loopback alone excludes malicious
websites.

Preferred production origin is a single `http://127.0.0.1:<configured-port>` serving
both the React UI and `/api/v1`. Validate peer loopback address, exact Host/port and
browser Origin against that origin; reject mismatches, `Origin: null`, unexpected
cross-site Fetch Metadata and unsafe requests before inference. POST with no Origin
is not accepted as a browser request; any native diagnostic exception must be an
explicit separately authenticated policy, not a blanket bypass. GET health/version
may lack Origin for navigation/diagnostics but still require exact Host and loopback
peer validation. A website must not use this runtime as a free inference endpoint
or trigger model reload/download. Loopback is not protection against malicious
native software already running as the same user.

For Vite development, prefer a same-origin proxy targeting a fixed loopback runtime,
with an exact development origin allowlist, strict Host rewriting and loopback Vite
binding. The production adapter uses relative `/api/v1/...` routes. Direct browser
CORS access, if later required, allows only configured exact trusted origins; never
`*`, reflected arbitrary origins or global browser-security disabling. Single-origin
hosting and launcher integration are later steps, not a change to the POC proxy.

## Audio and request boundary

- Accept only multipart `audio` plus fixed `language=en`, never expected text,
  passage, answer, chunks, prompt, shell flags, executable/model path or remote URL.
- Reject unknown/duplicate parts and path-like control inputs. Ignore the browser's
  filename for filesystem operations; use fixed generated filenames.
- Enforce 12 MiB initial streamed request budget, 180 s decoded audio and one active
  transcription; these are runtime-configured, not browser-selected. Bound headers,
  body receive, decoding, output buffers, inference and shutdown work.
- Inspect the actual container/streams and decoded audio; MIME/extension can lie.
  Accept supported MediaRecorder audio containers, reject video/non-audio streams,
  malformed input and embedded network/resource references. No fetching URLs during
  decoding, including nested playlists. Validate resource use before accepting
  large decoded data or passing it to the engine.
- Normalize within runtime infrastructure to mono, 16 kHz, signed PCM s16le WAV.
  Do not move normalization into scoring or browser waveform-analysis modules.
- Use native APIs or fixed executable argument arrays without a shell; never
  concatenate browser input into command text. Resolve executable paths internally
  from trusted pinned runtime artifacts, not from request fields.

The public product API is the PTE runtime contract. If a later implementation uses
the official whisper-server internally, keep it on a private loopback endpoint and
restrict/disable its generic model-load, prompt, wildcard CORS and conversion
controls. Do not expose its example API as the production API. The current POC
patch is evidence, not a substitute for production validation or isolation.

## Model ownership and integrity

The runtime owns model resolution, storage, source/checksum validation, loading and
active model choice. The browser gets only the ID and loaded state. The initial
configuration allows `base.en` and `small.en`; base.en is the technical baseline,
not a final quality selection. No request may select an ID, path or URL.

Pin native sources to a reviewed revision/version and model downloads to a known
source plus documented checksums. Verify before load, including pre-existing files;
fail closed on mismatch. Do not execute arbitrary downloaded binaries or allow
arbitrary browser-supplied model sources. Download/update lifecycle is separate
from inference and must be explicit; transcription never uploads learner audio.
Version metadata reports actual artifacts, not a configured claim about a binary.

The verified baseline is whisper.cpp v1.8.3 at
`2eeeba56e9edd762b4b38467bab96c2517163158`, built locally; converted weights come from
the official whisper.cpp download tooling/repository. See
[POC setup/checksums](../../tools/local-stt/README.md) and
[notices](../THIRD_PARTY_NOTICES.md). Later runtime build manifests must pin the
complete native dependency inventory and reproduce exact shipped artifacts.

## Data, cleanup and errors

Microphone → browser Blob → localhost → local preprocessing → local Whisper →
transcript → browser. No cloud STT, external inference service or remote fallback.
Network may be used for intentional app/model downloads and updates later; the
inference path must remain local even when networking is unavailable.

Per-request isolated private temporary files are cleaned in `finally`; startup
crash cleanup touches only owned stale runtime entries after the instance lock,
with no symlink traversal. No permanent audio retention by default. Operational
logs omit audio, transcripts, expected answers, identities and arbitrary paths.
See [lifecycle](lifecycle.md) for permissions, cancellation and cleanup failures.

Client-side JSON is untrusted: validate API compatibility and required metadata,
local-only claims, non-empty transcript, allowed error codes and finite safe integer
timings. Unknown errors and malformed responses map to fixed safe messages; never
show raw native exceptions/stderr to learners. Cancelled or incompatible requests
must not produce a scored/persisted response. Runtime provides transcription
evidence only; deterministic scoring stays in TypeScript.
