# Security inputs for Step 05.09

## Artifact and build ownership

Use [artifact-manifest.schema.json](../config/artifact-manifest.schema.json) and the tested internal [validator/verifier](../src/artifactManifest.mjs). This is a format and verification primitive, not a shipped signed inventory or an HTTP/config path feature. Manifest v1 binds runtime version, platform/architecture and package-relative regular artifact paths to exact bytes and SHA-256. IDs and paths must be unique; path traversal/symlinks are rejected. Include Node (if shipped), whisper-cli, ffmpeg, ffprobe, the active model, all owned native libraries and static frontend assets. The launcher must enforce completeness, matching runtime/target and authentic manifest provenance before loading anything; the generic verifier cannot prove a manifest is authoritative or complete. Sign/authenticate inventory and updates through the selected distribution channel, and protect install directory ownership. Do not let an editable manifest authenticate arbitrary replacement executables.

All shipped models require SHA-256 + exact size. Keep upstream SHA-1 as provenance only. `base.en` has its verified SHA-256 already; development `small.en` remains SHA-1 + bounded-size checked, with SHA-256 measured by benchmark setup. Do not claim a packaged small.en identity until its trusted source and SHA-256 are pinned. No arbitrary URL input, automatic repair download, model switching or PATH executable fallback. Continue supporting base.en if later benchmark evidence selects another model.

Build inventory must include whisper.cpp revision `2eeeba56e9edd762b4b38467bab96c2517163158`/v1.8.3 baseline, downstream patch hashes, compiler and CMake versions, Release/debug choice, all CPU/GPU/backend flags, target OS/arch, exact tool/library versions, binary hashes/sizes, source URLs and complete license/notices. See [development audit metadata](audits/build-dependencies-05.08.json). A hash identifies bytes; it does not prove builds are bit-for-bit reproducible. Define reproducibility checks in the actual package pipeline.

Current native verification does not attest every dynamic library. Either ship/inventory the complete owned dependency closure with controlled loader search paths or clearly define a supported, patched system-library boundary. System ffmpeg/ffprobe are development dependencies only. Package-owned decoder hashes must be verified before native work; fingerprint checks are an additional mutation defense, not a replacement for SHA-256 identity.

## Launcher, browser and process policy

Keep IPv4 `127.0.0.1` binding and exact trusted same-origin requests. Prefer unprivileged ports (1024–65535), handle collisions without hijacking other listeners, and serve controlled frontend assets with runtime/API-compatible same-origin routing. Do not reuse permissive generic whisper-server endpoints or expose browser-selected native/model paths. Evaluate per-launch random secret only against the final architecture; origins alone cannot authenticate native same-user callers.

Origin checks do not protect against malicious code in the trusted packaged origin. Required CSP concept: `default-src 'self'; connect-src 'self'; media-src 'self' blob:; script-src 'self'; style-src 'self'` with only the additions demonstrated necessary by built assets. Verify audio blobs, workers/fonts/styles and routing before finalizing the policy. No remote scripts, remote STT, automatic cloud/browser fallback or telemetry by default. App-serving responses need CSP and appropriate browser headers; API already supplies JSON/no-store/nosniff/close. Preserve frontend literal text rendering and explicit IndexedDB saves.

Sanitize launcher environment before Node/native loading, including NODE_OPTIONS/NODE_PATH, loader/preload/library search, proxy and tool/model variables. Runtime native children already get a minimal environment (locale and Windows SystemRoot only); a Node script cannot undo injected code loaded before it starts. Keep absolute owned executable paths. Windows requires restricted DLL loading and OS Job Object child-tree cleanup; POSIX launcher/process-group ownership must cover abrupt parent termination and graceful shutdown. Avoid root/admin execution and privileged ports. Add platform-native CPU/memory/disk containment if required; current time/size/slot controls do not bound every decoder allocation or constitute an OS sandbox.

Do not mask fatal programmer errors. Current fatal handler emits a fixed structured code, attempts bounded shutdown and exits nonzero; after an unclean exit recover stale private temp only after confirming the previous lock owner is dead. A disk/permission cleanup failure can leave private files and requires recovery. Review crash/core dumps and swap; disabling core dumps where practical improves privacy but does not guarantee no OS persistence.

## Packaging architecture choices

| Strategy | Security implications to evaluate |
| --- | --- |
| Bundled Node | Own and update the exact supported interpreter and bundled licenses/CVEs; locked module/asset resolution, sanitized env and launcher lifecycle |
| Compiled/single-executable Node application | Embedding does not remove V8/Node/library CVEs; prove asset/module loading, update/signature behavior, permission boundaries and native child ownership |
| Future native rewrite | New HTTP/parser/process/crypto code is a new attack surface; port the invariants and regression/stress suite, then compare maintenance/update cost |

05.09 selects architecture based on operational/security evidence. The current shell is Node v25.8.1 on Linux for validation. Node 25 is listed as EOL in [the official release lifecycle](https://nodejs.org/en/about/previous-releases); do not ship this validation interpreter as the production runtime. Choose and validate a maintained LTS release in 05.09. No new npm runtime dependency was added for 05.08. React, React Router, Dexie, Vite, TypeScript and oxlint remain the existing build/application dependencies.

## Dependency and license gates

`npm audit` is one input, not an automatic upgrade instruction or native-CVE audit. Inventory Node and native dependencies separately; consult upstream/distribution advisories for the exact shipped versions/builds, including ffmpeg codecs/libraries and ggml. Update policy: security advisory → assess exposure/patch → rebuild trusted inputs → runtime/security/stress regression → private speech benchmark regression → signed package/install/update validation. If the human regression corpus is unavailable, mark that quality check pending rather than claiming it passed.

Review [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md), exact transitive licenses, source correspondence, downstream patches and required notice/source distribution. This machine's ffmpeg build enables GPL. Final redistribution build and obligations remain unresolved; do not describe it as LGPL-only. FFmpeg's license depends on enabled components and nonfree/GPL build options. [FFmpeg's official license guidance](https://ffmpeg.org/legal.html) informs this review; final package compliance is not claimed here.

Do not finalize model winner, model-specific RAM limit, final inference timeout or installer/model download size until 05.07 human evidence exists. Current operational ceilings (12 MiB upload, 180s audio, 300s inference configuration maximum) prevent accidental unbounded config, not empirically selected product acceptance thresholds. Default inference remains 60s and one slot. Repeat controlled stress and real speaking flow validation on Linux/Windows/macOS packages, and retain benchmark hashes/revisions across upgrades.
