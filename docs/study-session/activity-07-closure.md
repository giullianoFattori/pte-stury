# Activity 07 — Study Session Engine + Practice Modes

Status: **COMPLETE** for the Activity 07 feature boundary and the internal Linux host technical path. Cross-platform release certification remains **PARTIAL**, with the release gates listed separately below.

## Scope and architecture

The Activity 07 feature boundary is session orchestration for the existing WFD, RS and RA tasks:

```text
selection → frozen StudySession queue → durable IndexedDB state
→ reusable task exercise → atomic task outcome + progress
→ resume / conflict / abandon → completed summary
```

Quick, Task and Mixed share the domain builder, capacity-aware allocation, transactional persistence, exercise dispatcher and `/study/session/:id` runner. Selection, scoring, lifecycle and navigation remain separate. Dexie remains **v3**. No new modes, task/scoring algorithms, adaptive ranking, mastery, Error Lab, Review Queue or redundant persisted summary aggregates were added for closure. The only production fix is the bounded packaged SPA fallback described below.

The authoritative invariants are one active versioned session, immutable unique queues, expected-index/item concurrency checks, Attempt session linkage, atomic Attempt/Error/Review/progress writes, terminal lifecycle protection, historical resolution on resume, and summary aggregation from the exact ordered Attempt ledger. Explicit End preserves saved history. Ordinary navigation preserves resumability.

## Automated and development-browser evidence

`npm run validation:session:closure` runs the established content validation/build/verification/audio checks, `npm test`, production build, lint, package tests and all six browser suites sequentially. It fails on any command error and consolidates the freshly produced audits. Test logs remain under ignored `.local-packaging/session-validation/logs/`; no browser profile, recording or transcript is committed.

Evidence: [browser closure audit](../../audits/session-07.10-browser-closure.json), including UTC timestamps, source commit, dirty-worktree flag, platform, Chrome version, contentVersion, counts and source audit paths.

| Layer | Result | Scope |
| --- | --- | --- |
| Application/runtime | PASS | 995 tests, including session lifecycle/concurrency/rollback/integrity and standalone task regressions |
| Package tests | PASS | 7 inventory/static-serving/security tests |
| Content | PASS | Structural, deterministic build/hash, manifest and real MP3 integrity/decode |
| Build / lint / diff check | PASS | Production React assets and TypeScript |
| Exercise adapter browser | PASS | WFD/RS/RA session and standalone saves, failure/retry, duplicate guard, state reset |
| Quick browser | PASS | Frozen five-item session, refresh/resume, save feedback, completion, two-tab conflicts |
| Task browser | PASS | Capacity, difficulty, 3/5/Max, single-task queue, refresh/resume and completion |
| Mixed browser | PASS | Balanced queue, cross-task transitions, media cleanup, capacity and completion |
| Navigation browser | PASS | Back/resume, keyboard End/Cancel/Escape/focus restoration, abandonment/races, safe terminal/error states |
| Summary browser | PASS | Exact persisted metrics, reload, catalog independence, missing-Attempt safe failure/Retry |

All six development suites passed with **zero uncaught page errors and zero unexpected remote application requests**. They use actual React/StrictMode, IndexedDB, MediaRecorder and Web Audio with controlled local STT HTTP, rather than physical microphones or recognition-quality measurements.

### Harness startup

07.09's initial-route timeouts belonged to development-harness startup. The shared test helper now warms Vite's static module graph and probes the root HTML before Chrome navigation, with explicit deadlines. Checks run sequentially to avoid shared optimizer/npm state races. No failed product assertion is automatically retried or hidden. All six suites passed in the closure run with this readiness boundary. Production serving uses the packaged runtime and never Vite.

## Package evidence

[Linux package audit](../../audits/session-07.10-package.json): **PASS**, Chrome 154.0.8037.97 on Linux x64. The rebuilt archive was extracted into an isolated test installation and verified before its native launcher started the owned Node/runtime. Host Node/ffmpeg were unavailable through PATH and hostile ambient loader overrides were sanitized. Browser pages loaded from **http://127.0.0.1:8765**, without Vite, development source requests or remote dependencies.

| Packaged check | Result | Actual scope |
| --- | --- | --- |
| Fresh browser profile | PASS | 17 active eligible learner items, zero technical items, sessions and Attempts |
| SPA deep links | PASS | `/study`, all three standalone task routes and existing `/study/session/:id`; active/completed/abandoned refresh |
| Quick | PASS | All five items completed: 2 WFD, 2 RS and 1 RA; task cards, duration/disclaimer and reload-stable summary |
| Native packaged speech | PASS | Three browser uploads using actual MediaRecorder WebM/Opus → packaged ffmpeg → whisper.cpp; no STT response substitution |
| Browser/runtime restart | PASS | Close the browser process and launcher after answer 1; reopen the **same profile**, same origin; Attempt, currentIndex=1 and entire frozen queue unchanged |
| Task | PASS | WFD three-item session: save one, Back/Resume, real two-tab stale-save conflict/reload, End and ended-route refresh |
| Mixed | PASS | Five-item balanced queue; save WFD, refresh to exact queued RS, End; new-session creation after previous abandonment |
| History/integrity | PASS | Saved outcomes retained after End; queue uniqueness, one-active maximum, exact Attempt linkage/ledger and final row-count consistency |
| CSP / normal network | PASS | Zero page errors, CSP violations, development asset requests or remote app requests |
| Runtime network | PASS | strace followed both launcher-owned trees: 124 IPv4/IPv6 connect calls, all observed destinations loopback |
| Offline isolation | PASS | Separate bubblewrap network namespace exposed only package + OS libc/loader and controlled fixture files; UI, health, 17 items, 11 audio assets and real RA/RS transcriptions passed |
| Shutdown/privacy | PASS | No tracked owned process or request temp entry remained; no transcript in launcher logs; no transcript/audio archived in audits |

Task and Mixed packaged tests are intentional **partial-session smokes**, not claims of separately completing every packaged mode. Their full completions are covered by the development-browser regressions; the entire packaged speech/summary path is completed through Quick. Standalone package coverage in this run is direct-route/SPA loading; standalone interactions are covered by the existing exercise/browser regressions. The launcher uses `--no-browser` and the harness opens actual Chrome; default-browser handoff/tray UX is not separately recertified.

The browser blocked non-origin HTTP and observed zero attempted remote app requests. The separate runtime probe used an isolated network namespace with loopback only. This is stronger than merely disconnecting browser fetch, but still **not a clean VM/desktop installation certification**. Controlled synthetic TTS is not a physical microphone or human learner benchmark. The persistent synthetic test profile is removed after the run; no personal browser profile or learner data was used.

### Exact package identity

- Validated application/runtime source: `291f8bf5af5d1c6a1d34236ede77c6deab2b9e8c` (includes the SPA fix).
- App/runtime/API: 0.1.0 / 0.1.0 / 1; engine whisper.cpp 1.8.3; model `base.en` baseline, not a selected quality winner.
- Bundled Node: **24.21.0 LTS**. The build reran application/runtime/package checks and Go launcher tests with its pinned toolchain.
- Build: `2026-10-17T03:56:45.679Z`; `buildDirty=true` is recorded because validation tooling/docs were being authored. No signed/clean-release provenance is implied.
- Archive SHA-256: `6517512ff3ac801b4e1f47582b64309491d1aca40f7a971eb99039523cdfd973`.
- Manifest SHA-256: `01d21131aa9c33eb3b63c68ffd562405990028f2c083ba0abb9906a47de407cb`.
- Content version: `sha256:bd666658b8e96465a676daf4881e8bb7c8322a1165b11fd14936e873a6b837c2`.

### Performance and bundle disposition

Single controlled instrumented run; no arbitrary latency gate or cross-machine performance claim:

| Measurement | Milliseconds |
| --- | ---: |
| Launcher/runtime ready with strace | 9485 |
| Runtime ready after restart with strace | 9285 |
| Fresh Study route load | 288 |
| Quick creation/persist/route | 118 |
| Resume | 109 |
| Continue/read persisted item | 48–76 |
| Summary load/render | 70 |

The separate uninstrumented build-host package smoke reported ready=3,489 ms, verification=269 ms and first transcription=3,083 ms; these are different measurement boundaries from the traced browser run. Package archive: **185,518,172 bytes**. Owned frontend JS: **556,726 bytes**; CSS: **6,329 bytes**. Vite reports approximately 168.47 kB gzipped JS and its existing >500 kB warning. The warning is accepted for this internal offline phase: observed UI transitions show no material blocker, so code splitting is deferred rather than changing architecture to silence a warning.

## Defect found and ownership

The first extracted-package run successfully started Quick but failed on refresh: the runtime static allowlist omitted `/study/session/:id`. This was a **medium-severity usability defect** in Activity 05 runtime/package static serving with direct Activity 07 impact, not an IndexedDB or speech-scoring defect. Commit `291f8bf` adds fallback only for a bounded 1–128-character session identity segment, serving the existing manifest-owned index. API isolation, unknown routes, querystrings, subpaths, traversal, non-GET methods, CSP and no-store remain enforced. Regression assertions cover valid UUID/opaque IDs and malformed/boundary paths. No architecture or API version change was needed. The package must be rebuilt after this fix; the pre-fix archive is not certified.

A subsequent dev regression run also timed out at its final missing-session UI check. The standalone diagnostic rerun passed with zero page errors; no corresponding product defect was established. The complete closure sequence is explicitly rerun rather than suppressing the failed assertion. The orchestrator marks in-progress evidence PENDING and command failures FAIL to prevent stale PASS reuse.

## Release gates and limitations

These belong to Activity 05 and remain distinct from Activity 07's implementation closure:

| Release gate | Status |
| --- | --- |
| Clean-machine Linux install | PENDING |
| Windows native package/install/browser | PENDING |
| macOS native package/install/browser | PENDING |
| Physical microphone allow/deny/re-enable certification | PENDING |
| Human learner corpus/model comparison | PENDING |
| Final model winner | PENDING — base.en remains the baseline |
| Signing/notarization and external-distribution review | PENDING |
| Human manual/keyboard smoke in this run | PENDING — automated keyboard/dialog checks are separate |

Controlled TTS is technical evidence only. The local same-OS-user/native-process and privileged-extension limitations from the runtime threat model still apply. Unsigned artifacts are internal-only.

06.08's 1k/5k/10k build/sync/query evidence and real-browser 1k/5k profiling remain applicable: session queries/index strategy did not change. See [content migration](../content/migration-06.08.md) and its archived audits. No extra index or cache was justified here.

## Final status and next activity

All closure acceptance criteria passed for the supported internal Linux host path. No known session data-integrity blocker remains.

| Step | Status |
| --- | --- |
| 07.01 Domain Contract | COMPLETE |
| 07.02 Session Builder | COMPLETE |
| 07.03 Persistence/Resume | COMPLETE |
| 07.04 Exercise Adapter | COMPLETE |
| 07.05 Quick Practice | COMPLETE |
| 07.06 Task Practice | COMPLETE |
| 07.07 Mixed Practice | COMPLETE |
| 07.08 Runner/Navigation | COMPLETE |
| 07.09 Summary | COMPLETE |
| 07.10 Validation/Closure | COMPLETE |

**Activity 07: COMPLETE.** **Linux host packaged technical path: PASS.** Activity 05 clean-machine, Windows/macOS, signing, physical-microphone and human-model release gates remain PENDING; Activity 05 is not globally closed by this report.

Activity 08 may now begin by inspecting the blueprint, choosing the exact Wave 1 tasks and implementation order, and verifying current official Pearson facts where needed. New tasks should plug into content → exercise/scoring → Attempt → dispatcher → session modes → task-specific summary, without redesigning the session engine.

## Reproduction

Build-host prerequisites are unchanged from `packaging/README.md`, plus test-only Playwright/Chrome, strace and bubblewrap for the audits. They are not learner package dependencies.

```bash
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run validation:session:closure
npm run package:linux
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run validation:session:package
git diff --check
```

The archive, extracted installation, temporary browser profiles, native toolchains and syscall logs stay in ignored local storage. The audit records exact archive/manifest SHA-256 identities, versions, build time, tested Git revision and the build's dirty flag. Validation utilities/docs are authored in the worktree; this flag is preserved rather than claiming a clean signed release build.
