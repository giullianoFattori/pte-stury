# Local speech runtime threat model — 05.08

Scope: API v1 development runtime, production Whisper CLI integration, preprocessing, temporary ownership and preparation for distribution. Human model selection is pending 05.07. This review does not claim a shipped, OS-sandboxed or commercially licensed package.

## Assets and actors

Protect learner audio and transcript, model/native artifacts, runtime availability, private temp storage, host CPU/RAM/disk/file descriptors, and the integrity of study data downstream. The runtime does not access Attempts, ErrorRecords, ReviewItems, mastery or IndexedDB; the trusted frontend saves those after explicit learner action.

| Scenario | Relevant protection | Remaining boundary |
| --- | --- | --- |
| A malicious remote website | IPv4 loopback listener; exact Host/Origin; required POST Origin; Fetch Metadata; no CORS wildcard | No defense against code already inside the trusted origin |
| B malicious local browser tab | Foreign/null/missing POST Origin fails; exact route/method/body schema | A tab with the trusted origin's privileges can request work; resource bounds still apply |
| C malformed local HTTP client | Node parser bounds, duplicate-header checks, strict streamed multipart, deadlines, one slot | Native clients can forge Origin/Host; these headers are a browser-origin boundary, not native-client authentication |
| D corrupt/malicious media | Magic-selected demuxer, file-only protocols, MOV external-reference flags, stream/codec/rate/channel checks, decoded duration/output budgets, native deadlines and output caps | Decoder vulnerabilities remain possible; no OS sandbox or aggregate native-RAM limit is claimed |
| E corrupt model | Trusted allowlist/source; streamed hashes and size; startup load check; before/after fingerprint checks | Trusted install root and manifest authenticity are required; remaining execution races below |
| F corrupt native binary | Fixed regular executable, pinned engine build metadata, startup usability check, stable identities; decoder identity captured before readiness | Development trusts local build/system install at startup. Signed/authenticated SHA-256 package inventory is mandatory in 05.09 |
| G accidental local misconfiguration | Exact config keys/types/host/model; bounded regular UTF-8 JSON; resource ceilings; no runtime path/env overrides | Privileged ports remain development-compatible; packaging must disallow them |
| H crashed previous runtime | Exclusive private PID lock; confirmed-dead stale recovery; generated-entry-only cleanup; conservative malformed/PID-reuse handling | Unclean termination can leave private audio until next successful recovery; disk/permission failures can require manual recovery |
| I malicious native process as the same OS user | Bounds reduce accidental damage, but no complete account-isolation defense | **A malicious native process running as the same OS user is outside the protection boundary of this local HTTP service.** It can forge HTTP headers, alter user-owned files or inspect data directly |

## Trust boundaries

| Boundary | Trusted input | Validation |
| --- | --- | --- |
| React/browser → development Vite proxy | Controlled frontend assets and browser origin enforcement | Proxy checks original Host, Origin, Fetch Metadata and upgrades before rewriting to fixed loopback target; relative client endpoints, no redirects/retry/fallback |
| Packaged frontend → runtime (future) | Package-owned frontend served on selected local origin | 05.09 must provide same-origin serving, controlled assets, strict CSP and local-only connections; development proxy is not the packaged security design |
| HTTP → request lifecycle | Nothing in uploaded fields, filenames, paths, MIME or forwarding headers | Exact peer/Host/Origin/routes/methods; Node framing; byte/header/time budgets; exactly audio + language=en; one expensive-work slot |
| Request → ffprobe/ffmpeg | Fixed absolute tools and generated runtime-owned paths | Actual magic and stream properties; fixed no-shell arguments; file-only protocols and MOV drefs disabled; deadlines/output caps; before/after tool identity |
| Normalized audio → whisper.cpp | Verified runtime-owned PCM WAV and allowlisted verified model | Fixed audio-only English/CPU/four-thread arguments; no prompt/answer; bounded fatal-UTF-8 output; no diagnostic/timestamp/control output; cleanup before response |
| Runtime → filesystem/artifacts | OS account, installation parent directories, runtime-owned private namespace | Regular-file/non-symlink checks, O_NOFOLLOW where available, inode/size/mtime/ctime checks, model hashes, exclusive creation, ownership/private permissions and lock |
| Transcript → frontend/study state | Validated plain text; React renders text, not HTML/native JSON | Stable v1 response validation, frontend compatibility checks and explicit save; normalization/scoring remains in TypeScript |

## Enforced invariants

- The runtime binds only `127.0.0.1`; IPv6/LAN/forwarding headers cannot authorize a request.
- API accepts exact documented routes and GET/POST methods; no query model selection, URL, expected answer, prompt, arbitrary native/model path or generic shell API exists.
- Upload filenames never select storage paths and are never logged. Unsupported multipart fields fail closed.
- Native work uses fixed trusted executables, fixed/bounded arrays, shell:false, ignored stdin, separate 64 KiB stdout/stderr caps, deadlines, abort and awaited close.
- Preprocessing never intentionally fetches remote media. Protocol/demuxer restrictions are configuration defenses, not an OS network sandbox.
- Success is sent only after validation and request-temp cleanup. Cleanup/storage failure makes health non-ready; malformed media and ordinary inference crash do not poison otherwise valid artifacts.
- HTTP errors do not expose paths, hashes, commands, stacks, native stderr, identity or raw exception strings. All JSON/socket-error responses are no-store/nosniff with close semantics.
- Logs contain bounded lifecycle/status/version/model metadata, never audio/transcript/question/filename/native stderr. No telemetry or transcript cache exists.

Fast tests are in `runtime/tests/security-hardening.test.mjs` and the existing audio/config/process/Whisper suites; long evidence is in [the security review](security-review-05.08.md).

## Residual risks and assumptions

OS account, trusted package install parents, system libraries and interpreter startup are trusted. Same-user malicious native code, privileged/root attackers, privileged browser extensions, compromised trusted-origin JavaScript and physically compromised host storage are outside complete protection. Loopback binding does not constitute authentication against native local clients.

Fingerprint/open-handle checks detect normal mutation and refuse symlink final components. Model hashing uses an O_NOFOLLOW open handle; config is snapshotted once with before/open/after checks and then frozen. Decoder/executable launches still resolve paths through the OS after checks. An attacker who controls parent directories or restores an artifact between checks can exploit TOCTOU; postchecks cannot undo a malicious binary's side effects. Packaging must authenticate manifest and protect install parents. Current engine metadata/fingerprints do not attest every dynamically loaded library; decoder startup identity trusts the installed system binary, not a cryptographically pinned development system package.

PID locks intentionally retain PID-reuse ambiguity: a reused live PID fails closed. An instance UUID alone would not prove the old process died. POSIX native work uses an owned process group, SIGTERM then a 100ms grace and SIGKILL, awaited close. Trusted tools are expected to remain in their group; malicious native code can escape it. Windows currently guarantees direct-child termination only; 05.09 needs Job Object/launcher tree ownership and platform tests. OS/init controls reaping after catastrophic kill; normal validated workloads must leave no active children or zombies.

Finally cleanup is a best effort under real filesystem failures. A cleanup failure may leave private learner bytes on disk; the service fails closed and successful restart performs bounded stale recovery. SIGKILL/power loss/core dumps/swap can also place or retain audio/transcript buffers on disk. Do not advertise absolute no-disk guarantees without OS dump/swap policy. Disable core dumps where appropriate during packaging. No cache and no default telemetry are implemented.

No rate limiter, circuit breaker or token was added: current controlled stress found no gate/FD/temp failure. A per-launch secret can distinguish cooperative launcher clients, but does not solve same-user OS compromise or trusted-origin XSS. 05.09 must decide it against its actual launcher/browser origin exposure and secret delivery; never place a universal secret in frontend assets. Model RAM, final timeout, download size and model winner await human benchmark evidence.
