# Activity 05 — Step 10: packaged runtime validation

Activity 05 status: **PARTIALLY COMPLETE**. Linux host technical validation: **PASS**. Internal Linux release closure: **PENDING** because a true clean-machine test and physical microphone/desktop launch are unavailable. Cross-platform closure and human model quality: **PENDING**. There is no observed critical runtime/privacy failure that warrants BLOCKED.

The user confirmed that no clean Linux/Windows/macOS machine is available. Filesystem/network isolation is evidence about this host, not certification of another installation. Controlled TTS proves the packaged pipeline; it does not satisfy the 05.07 human-speech gate. base.en remains the baseline; no model winner is selected.

## Package identity

| Field | Validated value |
| --- | --- |
| App / runtime / API | 0.1.0 / 0.1.0 / 1 |
| Engine / model / Node | whisper.cpp 1.8.3 / base.en / 24.21.0 LTS |
| Target / label | linux-x64 / INTERNAL/UNSIGNED |
| Archive SHA-256 | 0ccab5a3277e305fec7a0efd5607d0d27c84189274dfa59553c1a9df28f8713c |
| Manifest SHA-256 | c071e427729c065a4fa73b07b5acb3a876a00ff4667d49d2d316f07faa06f0a8 |
| Build Git commit | 533f4d25cfa3b0e7e2a4f6802f7401d8e6d3648d |
| Build timestamp UTC | 2026-10-10T03:32:57.005Z |
| Dirty build | true — build metadata and validation tooling were uncommitted; not a signed release |
| Archive / inventoried bytes | 185447656 / 306483247 |

The tar archive was extracted to a separate installation directory before Step 10 tests. The runtime used package-owned resources with an unusable PATH and hostile inherited Node/loader overrides. The external validation driver uses this repository and test tools; the installed application does not. Every Linux evidence file carries this exact identity. Other target identities contain null hashes/timestamps because no package was validated.

## Target matrix

| Target | Package build | Clean machine | Browser speech | RA | RS | Persistence | Shutdown | Signing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Linux x64 | PASS | PENDING | PASS | PASS | PASS | PASS | PASS | PENDING |
| Windows x64 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| macOS x64 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| macOS arm64 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

Linux browser speech means the controlled real MediaRecorder→Whisper flow in Chrome 154.0.8037.97; physical microphone allow/deny/re-enable is PENDING. macOS x64 remains intended, not silently removed from scope. Linux unsigned packaging is allowed internally, but signing is PENDING for external distribution. Native launchers for other targets were cross-compiled in the build; that is not an installer or native smoke PASS. Safari is NOT TARGETED for the initial browser claim.

## Tests and measured evidence

- **PASS — integrity:** all 71 artifacts SHA-256/size verified; launcher --verify rejected corrupt frontend JS, whisper-cli, model and ffmpeg; missing ffprobe; an extra unlisted artifact; a symlink; and manifest traversal. No inference was started by these eight tamper cases. Inventory authenticity is PENDING until signing.
- **PASS — packaged runtime:** health ready, API 1, whisper.cpp, loaded model, processedLocally; 20 sequential real CPU transcriptions; concurrent RUNTIME_BUSY; abort/recovery; real 60-second inference timeout/recovery after SIGSTOP; second instance; fixed-port collision; Quit during inference; SIGKILL launcher/runtime crash and subsequent restart. No surviving tracked native process or request temp remained.
- **PASS — browser/domain regression:** three RA passages and three RS sentences at varying lengths, plus an intentionally partial RA utterance that produces ErrorRecords and a ReviewItem. Actual Web Audio, MediaRecorder, recorded playback, package decoder and Whisper, RA browser fluency, RS chunk feedback and explicit save were used. Expected answer/reference was not sent to the runtime. WFD playback, exact score/save and next reset passed without STT.
- **PASS — persistence:** 8 Attempts, 10 ErrorRecords and 3 ReviewItems were compared in memory after tab close/reopen, runtime restart and same-version package reinstall into another directory. Origin stayed exactly http://127.0.0.1:8765. No study text or database rows are archived. Signed version-to-version update/uninstall implementation remains PENDING; documented policy preserves browser/profile/app data by default.
- **PASS — frontend/security:** production same-origin React without Vite, zero normal-flow page errors/CSP violations/non-local application requests, blob recording playback, multiple same-origin tabs. Intentional remote script/connect attempts were blocked by CSP, recorded separately from normal traffic. Static MIME/SPA/API isolation is covered by the package regression suite; no source maps ship.
- **PASS — network/privacy:** strace connect-only audit of launcher, Node and native children recorded 61 IPv4/IPv6 connect calls, all loopback. It does not claim full packet capture or OS sandboxing. Browser request audit covers application traffic, not every browser background service. Native stdout reaches the response; the runtime has no transcript cache, launcher discards native/runtime output, and temp request directories were absent after success/abort/timeout/shutdown. Audio/transcripts and raw traces are not committed.
- **PASS — offline isolation:** UI, health, RA and RS passed inside a filesystem AND network namespace with only package, glibc/OS loader and loopback available. No host Node/ffmpeg/dev tools or internet route. Physical internet disconnect plus actual desktop/browser is PENDING.
- **PASS — resource audit:** parent FD count 22→22; Node parent RSS 87116→86132 KiB; median request latency 2766 ms over all 20 runs. This is short host evidence, not a guarantee of no leak or a model resource budget. Native model memory is separate. App-data/temp permissions are 0700. Package root is 0775 in this user installation; signing/authentic installation permissions remain release requirements.
- **FAIL — embedded development-path cleanliness:** owned Node contains upstream /home/ strings; Whisper contains build paths; packaged runtime includes unused development-resolver .local-runtime strings. Only artifact names/pattern counts are archived. Remove private build paths (for example compiler prefix maps) and define acceptable upstream strings before external release. Dependency isolation still passed; these findings are not evidence of an HTTP path leak.

Size breakdown (bytes): {"launcher":7078048,"licenses":11684557,"manifest":8778,"model":147964211,"decoderAndLibraries":7879024,"node":126595440,"whisper":4273520,"runtime":66702,"web":932967}. Runtime-ready time under strace: 9986 ms. Separate build-host smoke timings are in packaging/out/linux-x64/smoke-report.json (local); they are not mixed with the extracted-package run. Browser-open timing by the launcher is PENDING; the harness opened Chrome directly. Measurements are observations, not invented acceptance thresholds.

## Commands / reproducibility

The full npm run package:linux pipeline used locked dependencies and pinned Node 24.21.0 and ran npm run runtime:test, npm test, npm run lint, npm run build, npm run package:test, pinned Go tests/builds and package smoke. Runtime tests: 49 PASS; application+runtime tests: 254 PASS; package tests: 4 PASS. Separate post-change runtime/app regressions and git diff --check were run as well. Go launcher tests used the locked SDK in .local-packaging/go with GOTOOLCHAIN=local. The earlier shared-network isolation smoke is supplemented here by the no-network namespace test.

Re-run instructions and limitations: [validation tooling](../../tools/runtime-validation/README.md). Privacy-safe per-target and component evidence: [05.10 audit directory](audits/05.10). Generated archives, source audio, browser profiles and build outputs remain ignored/local.

## Remaining gates and closure

Clean-machine installs on all four intended targets; Windows Chrome/Edge and macOS Chrome native media fixtures/permissions; native installer and browser-open handoff; Windows Job Object/macOS lifecycle tests; signing/notarization; actual sleep/resume and reboot/logout; signed update continuity; final redistribution review and embedded-path cleanup remain PENDING. No VM/hardware was available, so none is upgraded to PASS by cross-compilation or namespace smoke.

Human RA/RS model benchmark remains PENDING. Do not finalize model-specific RAM, timeout, installer size or download UX. If it later selects another model, rebuild and re-run package verification, startup/health, RA/RS, size, latency/resources and network/privacy audits. Learning intelligence should use speech evidence only from a validated target scope.

Final decision: **PARTIALLY COMPLETE**. Linux technical packaged pipeline passed; Linux clean-machine/internal release and cross-platform/human release gates remain open.
