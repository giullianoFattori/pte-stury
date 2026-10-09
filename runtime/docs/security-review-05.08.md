# Activity 05 — Step 08 security and resilience review

Status: **development runtime hardening complete; Step 05.09 packaging gates remain explicit**. API v1/runtime version 0.1.0 remains stable. Learner scoring, study domain, scheduler and IndexedDB schema are unchanged. The 05.07 human comparison/model winner remain pending; base.en is the preserved baseline.

Read [the threat model](threat-model.md), [privacy/logging policy](logging-privacy.md), [packaging requirements](packaging-security-requirements.md) and [controlled audit evidence](audits/README.md). Evidence was collected against the working tree based on `a3ff113`; exact build/dependency versions and dirty state are recorded in [build metadata](audits/build-dependencies-05.08.json). Stress uses test-only native fixtures with real preprocessing; the browser regression and separate native resource smoke use real pinned base.en with controlled TTS. None is a human quality benchmark.

## Findings and fixes

| Severity | Finding | Result |
| --- | --- | --- |
| Medium | Positive-safe-integer config allowed impractically huge upload/duration/time budgets | Explicit operational ceilings: 12 MiB upload, 180s decoded audio, 300s configurable inference; defaults remain 12 MiB/180s/60s/one slot |
| Medium | Native cancellation killed only the direct child; inherited environment included loader/tool overrides | Shared runNative uses no shell, fixed arguments, ignored stdin, minimal locale/Windows OS env, separate stream caps and deadlines; POSIX owned group SIGTERM/100ms/SIGKILL and awaited close; descendant test passes |
| Medium | Decoder artifact paths were fixed but later binary mutation was not checked | Capture regular non-symlink executable identities before readiness; verify before/after preprocessing; mutation makes health non-ready until restart. Packaging still needs authenticated SHA-256 inventory |
| Low | Multipart filename/header syntax accepted control bytes | Reject header controls and filename controls; discard safe path-looking/UTF-8 filenames; deterministic byte-split fuzz preserves boundary-like audio bytes |
| Low | A zero-progress filesystem write could loop forever | Reject zero bytesWritten; actual ENOSPC/write/internal storage and cleanup faults fail safely and make health non-ready |
| Low | Config final component could be symlink/nonregular, replacement or invalid UTF-8 could be ambiguous | lstat + O_NOFOLLOW/O_NONBLOCK + opened-file identity + before/after read checks; fatal UTF-8; reject BOM, trailing data and invalid keys/types |
| Low | Duplicate Content-Type/Fetch Metadata were not explicitly counted; raw socket errors omitted nosniff | Count critical raw duplicate headers; preserve exact Host/Origin/peer checks; all socket/JSON error responses use no-store/nosniff/close |
| Low | Unexpected process exceptions/rejections could print a raw stack; a derived finally promise could reject unhandled | Fixed structured fatal log, bounded shutdown/nonzero exit; shared shutdown promise; explicitly handled request-task rejection; no raw exception logging |
| Low | Transcript helper had no standalone byte cap and allowed C1 controls | 64 KiB standalone/output cap; fatal UTF-8; reject C0/C1/DEL, timestamp/diagnostic decoration; preserve ordinary Unicode and literal JSON-like text |
| Informational | No authenticated shipped native/model/library inventory yet | Added schema and tested package-relative SHA-256/size verifier for 05.09. Generic verifier does not establish manifest authenticity/completeness; launcher must enforce that |
| Informational | Loopback headers cannot authenticate malicious native same-user processes | Explicit threat boundary, extension/trusted-origin residual risks, CSP and launcher-token decision deferred with rationale |

During development a broad internal-failure classification incorrectly made aborted/malformed chunked requests non-ready. Regression tests caught it; disconnect/abort stream errors are now isolated while actual storage/programmer failures make health non-ready. Ordinary inference crash fails its request without automatic fallback, retry, download or unnecessary health poisoning. Cleanup failure returns no transcript success.

## Controls exercised

| Area | Validation and result |
| --- | --- |
| Loopback/peer | Actual IPv4 listener; unit policy cases for 127.0.0.1, ::1, both mapped-IPv6 forms and LAN; fake Forwarded/X-Forwarded-For cannot authorize |
| Host/Origin/DNS-rebinding | Correct Host; localhost/wrong port/rebinding domain; duplicate Host/Origin; null/foreign/missing POST Origin; cross-site Fetch Metadata; mixed-case headers; all unexpected requests rejected |
| Node framing/header boundary | Duplicate/equal/conflicting Content-Length, CL+TE, malformed chunks, oversized header, >32 fields, whitespace variants, Expect, Upgrade and CONNECT; bounded safe errors and recovery |
| Routes/methods | Query/model query, trailing slash, raw/encoded traversal, double slash; HEAD/OPTIONS/PUT/PATCH/DELETE/TRACE/CONNECT on every API route; only exact documented GET/POST routes succeed |
| Multipart | Missing final boundary, malformed CRLF, nested MIME, duplicate fields/disposition/content type, unknown answer/model/URL fields, filename size/control/path/UTF-8 cases, bytewise splits and embedded boundary-like bytes; no storage escape/hang |
| Media limits | Random/magic-valid malformed media, MIME disguises, video, duration metadata and durationless overlong WebM, compressed amplification, >192kHz, >8 channels and unsupported PCM codec; actual decoded/output budgets preserved |
| Media network | Node outbound guard plus real decoder protocol arguments; strace -f on native ffprobe/ffmpeg with HTTP/HTTPS/TCP/UDP inputs: eight rejected cases, zero AF_INET outbound connect/send calls. Not an OS sandbox |
| Process lifetime | Preprocess/inference timeout and disconnect, capped stdout/stderr, invalid UTF-8, crash, owned descendant kill, graceful/hard termination, startup shutdown and immediate restart; awaited owned children |
| Temp/locks/faults | Existing live/dead owner recovery, malformed PID, symlink root/lock, unsafe permissions, stale-entry cap; injected ENOSPC/cleanup faults, gate release/non-ready health; unrelated/symlink-target files preserved |
| Mutation/integrity | Model truncation/content/replace/symlink; CLI truncate/replace/permission/metadata changes; decoder mutate/symlink; package-manifest SHA-256/size/path/duplicate/symlink/corruption cases; fail closed and restart required |
| Privacy/logs/outputs | No raw exception paths, checksums, commands, native stderr, filenames or transcript in errors/logs; structured lifecycle logs; no-store/nosniff headers; no runtime cache; fatal/rejection safe log and nonzero exit |
| Local traffic | 50 rapid health + 50 invalid uploads recover to a valid request; busy-slot/abort regressions pass. No rate limiter/circuit breaker added without a demonstrated need |

Only one expensive transcription slot remains. CPU/allocation/time/byte controls reduce resource risk but do not impose an aggregate native RSS cap or guarantee safety against an exploited decoder. Native/same-user request floods and trusted-origin compromise remain OS/package concerns.

## Stress and measured resources

- [Restart stress](audits/restart-05.08.json): 20 start → ready → real preprocess/controlled native transcribe → stop cycles on the same port/root. Port reused, lock removed, no request-temp growth and no surviving observed native PID/direct child.
- [Sequential stress](audits/transcription-05.08.json): 100 sequential requests after 20 warmups; production HTTP/temp/preprocess/native lifecycle. FD count stayed **22**, with **3 sockets / 8 pipes**, and **0 active child processes** at all checkpoints. No request temp directories accumulated.
- Parent RSS was **66,002,944 bytes** at the warmed baseline and **75,563,008 bytes** after 100 requests. A higher allocator/JIT water mark appeared around request 50; from request 50 to 100 RSS rose only 393,216 bytes. Heap used changed from **8,519,696** to **8,711,968** bytes; external memory from **4,086,338** to **4,300,849** bytes. RSS did not return exactly to baseline. This run shows a mostly flat latter-half resource profile without growing FD/temp/child counts; it is not proof against arbitrarily long-lived leaks. Explicit GC/checkpoint logging exists only in the test launcher.
- [Actual Whisper child smoke](audits/native-smoke-05.08.json): three real base.en CLI launches on one 6.705s controlled TTS clip; peak sampled child RSS **297,857,024–298,102,784 bytes**, measured separately from Node parent RSS. Launch-to-close included load: 4,149 / 4,105 / 2,769ms. These controlled observations do not choose a model, finalize RAM/timeout limits or satisfy the human benchmark.
- [Slow clients](audits/slow-client-05.08.json): production deadlines ended dripped headers at ~5.9s, dripped incomplete body at ~10.7s, stalled chunked multipart at ~10.8s and half-open socket at ~5.6s. All cleaned temp and accepted the next transcription. The Node header/request timers have bounded checking-interval granularity.
- [Listener/process audit](audits/lifecycle-05.08.json): ss confirmed one own IPv4 loopback listener; ps observed the owned native parent/process group during abort and timeout; both left no native PID/request temp and recovered.
- [Real Chrome regression](audits/browser-05.08.json): real React, MediaRecorder, production local Whisper base.en, six controlled RA/RS cases, explicit save/scoring/ErrorRecords/ReviewItems and real IndexedDB. Digital silence rejected; WFD source playback/comparison/persistence unaffected. **0 outbound browser requests**, **0 browser SpeechRecognition calls**. This is controlled technical validation, not learner-quality validation.

No model-specific acceptance threshold was invented. Keep the actual human corpus benchmark pending and rerun resource/accuracy checks after the package/native/model/backend choice. Linux controlled evidence does not certify Windows/macOS packaging.

## Native/environment/dependency audit

Production native spawning is centralized in `runtime/src/nativeProcess.mjs`; media and Whisper pass fixed trusted paths/arrays with shell:false, ignored stdin, bounded output, cancellation and deadlines. Benchmark resource measurement now uses that same helper and records `nativeEnvironmentPolicy: minimal-v1` plus Git identity. Benchmark metadata execFile is read-only build/tool metadata with bounded output/deadline; POC and test tooling are outside the shipped runtime. Test/stress subprocesses are separately bounded and never browser-configurable. No shell command construction enters the runtime request path.

No production PTE environment override selects host/origin/model/native path/resource limits. Minimal native env removes loader/Node/proxy overrides. OS temporary-root selection remains documented and ownership-checked; the package launcher must sanitize OS/interpreter temp/loader variables before startup. This cannot undo malicious interpreter preload code already executed. See [environment and lifetime details](logging-privacy.md).

`npm audit --json` returned **0 known advisories** for the locked npm graph in this snapshot. [Build/dependency metadata](audits/build-dependencies-05.08.json) inventories Node, React/React Router/Dexie, Vite/TypeScript/oxlint, real system ffmpeg/ffprobe and pinned whisper.cpp source/compiler/CMake/backend flags/binary hashes. This does not certify system/native CVE patch status or dynamic libraries. Step 05.09 must check exact release/OS package provenance and advisories, sign inventory and updates, and carry complete licenses/corresponding sources. Use [FFmpeg's security advisories](https://ffmpeg.org/security.html) and [Node's release lifecycle](https://nodejs.org/en/about/previous-releases) for the actual shipped inputs; no automatic dependency upgrade was performed.

## Validation and closure

`npm run runtime:test`: **49 tests passed**. `npm test`: **254 tests passed**. `npm run build`, `npm run lint` and `git diff --check` passed. Hardening stress/audit tools and real Chrome flow passed. `npm run benchmark:speech` still correctly refuses the empty human corpus, with no fabricated metrics; shared metrics/model/process tests pass. The full suite additionally exercises a partial ENOSPC write after bytes were written, verifies deletion and non-ready state, and tests model/engine symlink replacement.

Packaging gates remain: authenticated complete SHA-256 native/model/library/frontend inventory; dynamic-loader dependency boundary; maintained Node/package architecture; Windows Job Objects/POSIX launcher tree lifecycle; exact same-origin serving and CSP; optional per-launch-secret decision; native CVE/patch and GPL/codec/library redistribution review; crash/core/swap policy; owned installation/temp paths; install/update/signature validation. Model winner, final model RAM/inference timeout and installer/download size remain pending 05.07 human evidence.

The validation interpreter is Node 25.8.1, an EOL major according to [the official release lifecycle](https://nodejs.org/en/about/previous-releases). Packaging must select and validate maintained LTS; this development review is not approval to distribute the current interpreter.

The local service does not fully protect against malicious same-user native code, browser extensions with extra privileges, compromised trusted-origin code, root/host compromise, execution TOCTOU under attacker-controlled parents, catastrophic OS termination or failed disk deletion. No OS sandbox, universal authentication or infallible no-disk guarantee is claimed. These limits are explicit inputs to 05.09, rather than hidden by controlled success.
