# Step 05.10 validation tools

These are opt-in long Linux host/package audits, not part of `npm test`. They use an **extracted internal archive**, real packaged Node/FFmpeg/Whisper, controlled TTS and an external test driver. They do not certify a clean machine, a physical microphone, Windows/macOS or human learner quality. Results contain package hashes/counts/timings, never recordings, transcripts, database rows, usernames or absolute private paths.

Prepare the package with `npm run package:linux`, then extract `packaging/out/PTE-Study-0.1.0-linux-x64-internal.tar.xz` into `.local-packaging/validation-05.10/`. Do not mix evidence from different package builds; the report generator rejects differing identities. Re-extract into an empty directory when changing the build. The package build records UTC timestamp, Git SHA and dirty state. Generated binaries/audio/profile data remain ignored.

Run from the repository root, sequentially (port 8765 belongs to one launcher):

```bash
node packaging/verify-package.mjs .local-packaging/validation-05.10/PTE-Study
npm run validation:speech:integrity
npm run validation:speech:runtime
PLAYWRIGHT_MODULE=/path/to/test-only/playwright/index.mjs npm run validation:speech:browser
npm run validation:speech:http
npm run validation:speech:offline
npm run validation:speech:resources
npm run validation:speech:report
```

Runtime validation requires Linux `/proc` and strace. It takes several minutes, including the actual 60-second inference deadline with a stopped native child. It runs 20 sequential real transcriptions, busy/abort/timeout, crash/restart and active shutdown. It deletes connect-only traces after aggregation. It tracks descendants and parent FD/RSS, without persisting process IDs or private command lines. A real error exits nonzero; reports are written only on successful completion. Old reports must not be mistaken for evidence from a failed rerun: inspect the exit code, package identity and createdAt.

The browser tool requires test-only Playwright and Chrome at `/usr/bin/google-chrome` and uses a disposable browser context. It injects a Web Audio media stream and uses actual MediaRecorder. It covers 3 RA + 3 RS, recording playback, fluency, chunk scoring, explicit save, intentionally partial RA to prove Errors/Reviews, WFD, multiple tabs, tab/runtime/reinstall persistence and CSP challenges. Allow/deny/re-enable of a **physical mic** remains PENDING. Study rows are compared only in memory. Same-version copy/reinstall is not a signed update installer test. The validation driver opens Chrome directly; the default-browser launcher handoff remains PENDING.

Offline validation requires bubblewrap/user namespaces. The package runs with only glibc/OS loader and a private temporary home, in an unshared network namespace with loopback. A test-only probe and two WAV fixtures are mounted separately. No Node/FFmpeg/compiler/npm from the host is exposed. This is stronger dependency/offline evidence, but it shares the host kernel and does not replace a true clean-machine desktop installation.

Integrity tests create and delete a private package copy, and prove both JS verifier and native launcher reject eight tamper cases. HTTP tests check production MIME/cache/CSP, SPA/API/static isolation and structured launcher output. Resources audit records dependency names from readelf, permissions, SBOM/license counts and a dev-path substring scan; findings do not include the matching private strings. The scan is a release hygiene check, distinct from HTTP error privacy or dependency independence.

`validation:speech:report` requires all Linux component reports to PASS for the same identity and creates `runtime/docs/validation-05.10.md` plus all four target records. Other platforms remain explicitly PENDING with null package identities. Embedded-path findings can be FAIL while technical execution is PASS; they must be resolved for external packaging. Clean-machine/human model/signing gates stay PENDING regardless of these controlled results.

A later model change requires rebuilding and rerunning verification, startup, RA/RS, latency/resources, package size and privacy/network checks. No model is selected by this tooling. No scoring/persistence implementation is modified. Uninstall removes package resources but preserves browser-origin/profile study data and app data unless explicitly requested; actual installer uninstall and version update remain pending.
