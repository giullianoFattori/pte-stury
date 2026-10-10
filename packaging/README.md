# PTE Study packaging — Activity 05.09

The initial distribution is an **unsigned, internal Linux x64 tarball**. The native Go launcher is cross-compiled for Linux x64, Windows x64, macOS x64 and macOS arm64. Windows/macOS runtime inputs, installers, signing and clean-machine validation remain release gates. Cross-compilation is not platform certification.

Architecture: a Go standard-library launcher owns a bundled Node **24.21.0 LTS** interpreter and the existing ESM runtime. Node serves the React production build and API at **http://127.0.0.1:8765**. A system browser supplies MediaRecorder, Web Audio, IndexedDB, fetch and FormData. No Vite, npm, development source, cloud speech service or SpeechRecognition is used in the installed product.

## Internal Linux build

Build prerequisites (not end-user prerequisites): Git, curl, tar/xz, GNU make, GCC/G++ 13.3.0, CMake 3.31.6 (the existing local CMake distribution), the verified local baseline model, and locked npm dependencies. The build runs dependency installation, runtime/app/package tests, lint, React build, native builds, staging and smoke validation. Downloads use fixed official URLs and committed SHA-256 identities in `sources.lock.json`; no mutable `latest` artifact is used. The model URL is hash constrained; the internal build reuses the verified local file.

```bash
npm run package:linux
```

Output (ignored by Git): `packaging/out/PTE-Study-0.1.0-linux-x64-internal.tar.xz`. Extract into a user-owned installation directory and run `PTE-Study/launcher`. Quit with `PTE-Study/launcher --quit` or Ctrl+C in the launcher terminal. The launcher remains alive when tabs close. `--no-browser` is an internal smoke option; `--verify` verifies without starting. The prototype uses a terminal and a separate Quit command; tray/menu integration and polished platform error dialogs are still pending.

The first build targets the host Ubuntu 24.04 ABI; it is not a universal AppImage. An AVX2/FMA/F16C-capable x64 CPU, glibc, the OS loader, system browser and `xdg-open` are supported system dependencies. Node, FFmpeg/ffprobe, Whisper, FFmpeg shared libraries and the Node GCC runtime libraries are owned by the package. Whisper links its ggml/Whisper libraries and GCC runtime statically, with the GCC runtime exception notices included. Verify exact ELF requirements before expanding the Linux support matrix. `.deb` is the preferred later managed Linux installer; AppImage requires an older ABI build baseline and separate validation.

## Layout and integrity

```text
PTE-Study/
  launcher[.exe]
  native/       node, whisper-cli, ffmpeg, ffprobe, owned libraries
  runtime/      production ESM modules only
  web/          production dist only
  models/       verified baseline model
  manifest/     package.json, build.json, sbom.cdx.json, whisper-config.cmake
  licenses/     actual notices and FFmpeg corresponding source/build flags
```

`manifest.schema.json` defines the package inventory. Every regular artifact is recorded with exact bytes and SHA-256, including the launcher, interpreter, JS, static files, model, shared libraries, notices and SBOM. The manifest itself is excluded from its own inventory. Extra files, missing files, symlinks, traversal, duplicate entries, wrong target/version and mismatched hashes fail verification. `verify-package.mjs` is an independent build-time verifier. The launcher verifies before launching Node; the packaged resolver verifies again before readiness. Development resolution remains separate.

Hashes detect corruption; **they do not authenticate an unsigned package**. Before external release, authenticate the complete inventory through signed installer/package metadata. Binary signing must precede manifest generation; final package signing/notarization follows it. No unsigned updater or arbitrary download/path configuration exists.

## Native inputs and platform staging

The shared `stage.mjs TARGET` executes only on its matching OS/architecture. Fixed build inputs are `.local-packaging/inputs/TARGET/{native/,licenses/,build.json,whisper-config.cmake}`. A reviewed target input must contain the owned Node LTS distribution, Whisper CLI, FFmpeg/ffprobe and all non-system libraries. `build.json` must identify compiler, CMake, CPU flags, pinned Whisper revision, exact FFmpeg source hash, Node version and dependency versions. No PATH/system ffmpeg fallback is allowed.

`npm run package:launchers` cross-compiles the four launchers with Go 1.27.2, CGO disabled, no third-party Go modules and `-trimpath`. `npm run package:windows` and `npm run package:macos` run native regressions and staging on matching runners; they deliberately fail without reviewed native inputs. They are **staging gates, not completed native acquisition or installer pipelines**. Pin Windows MSVC/MSYS2 and Apple Clang/Xcode/SDK revisions before enabling release builds. No release CI job is enabled with unreviewed mutable toolchains.

Whisper: v1.8.3, commit `2eeeba56e9edd762b4b38467bab96c2517163158`, Release CPU, GGML_NATIVE disabled, x64 AVX2/FMA/F16C baseline, no GPU/BLAS/OpenMP, no server. FFmpeg: 8.0.3 source, shared LGPL build, GPL/nonfree/autodetect/network disabled; only file protocol, WAV/Ogg/Matroska/MOV, native Opus/Vorbis/AAC/FLAC/PCM decoding, PCM WAV encoding and required resampling filters. Actual flags are `ffmpeg-flags.json`. No external codec libraries are selected. FFmpeg source is included and replaceable shared libraries support relinking; complete commercial redistribution review remains a release gate. The system GPL-enabled Ubuntu decoder is not shipped.

The internal baseline bundles `base.en` for deterministic offline startup, not as a benchmark winner. The resolver and inventory isolate model resources; changing the active model requires an intentional versioned build and SHA-256 identity, not a learner dropdown. Do not finalize commercial download strategy, RAM, timeout or size assumptions before the human benchmark.

## Lifecycle and privacy

OS app data: Linux `~/.local/share/PTE Study`, Windows `%LOCALAPPDATA%/PTE Study`, macOS `~/Library/Application Support/PTE Study`. Package resources are immutable by policy; temp/lock/control files live separately. POSIX directories require private permissions. Windows ACL inheritance/user ownership must be validated on a clean Windows account before release.

POSIX uses flock and a launcher-owned process group. Windows uses a per-user named mutex and a kill-on-close Job Object. A startup stdin gate prevents Node/native work before Windows Job assignment. Native children inherit the owned tree in packaged mode; development retains independent native process groups. Quit signals Node, aborts active work, cleans temp and hard-terminates the owned tree after a bounded grace. A launcher pipe disconnect also initiates runtime shutdown. A local-only, random-token control channel accepts only open/ping/quit; its 0600 metadata is private. It is not part of API v1 and does not change browser authorization.

Second launch reopens the existing origin without spawning a runtime. Startup verifies version/health with a 100-second bound, stops on error/crash and checks port collision. Port 8765 never silently changes; a collision fails with an actionable message. Tabs do not determine service lifetime. Runtime/launcher logs contain bounded lifecycle events only; child output is drained/discarded, no audio/transcript logs, no telemetry or cloud crash reports.

Browser IndexedDB remains at the stable origin and in the browser profile. An update must stop the launcher, atomically replace the complete installation, preserve app data and preserve the origin. Browser/profile changes are a separate migration concern. Uninstall removes package resources by default, preserving app data and browser study data; removing study data must be explicit.

## Validation and release gates

Platform build scripts run `npm run content:build` before regressions. Staging
verifies the committed generated catalog pair and inventories both files under
`web/content/` with SHA-256/size. The runtime serves these local JSON assets with
CSP/no-store; the current learner app still consumes its existing TypeScript bank.
See [06.03 build policy](../docs/content/build-06.03.md). After a failed content
build, do not package stale last-good outputs.

```bash
npm run package:test
GOCACHE=/tmp/pte-packaging-go-cache .local-packaging/go/bin/go test -C packaging/launcher ./...
node packaging/verify-package.mjs packaging/out/linux-x64/PTE-Study
node packaging/isolation-smoke.mjs
npm run package:smoke
PLAYWRIGHT_MODULE=/path/to/test-only/playwright/index.mjs node packaging/browser-smoke.mjs
```

The host smoke removes PATH access to Node/FFmpeg and injects hostile Node/loader environment overrides; the launcher sanitizes them. This proves dependency isolation on this host, **not a clean-machine install**. The optional Linux `isolation-smoke.mjs` uses bubblewrap to expose only the package, glibc/OS loader, proc/dev/tmp and a private temporary home; it also performs a real controlled transcription. It does not replace OS/desktop installer validation. Browser smoke uses real Chrome, MediaRecorder, packaged decoders, Whisper, RA/RS save and IndexedDB continuity across runtime restart. Controlled TTS is not the human model benchmark.

For each target on a clean machine with no Node, ffmpeg, Whisper checkout or development tools: install → launch → ready → browser opens → RA → RS → save → Quit during inference → no orphan/temp → restart → data persists. Then reinstall/update without changing origin and verify saved study data. Test actual Chrome/Edge Windows WebM, Chrome macOS WebM and Safari MP4/AAC if Safari is targeted. Safari is not yet certified. Test single instance, port collision, startup crash/timeout, active-work shutdown, launcher crash and tampered artifacts. Archive privacy-safe results separately for each platform; no raw learner audio.

Chosen later formats: Windows WiX/MSI (per-user installation, Authenticode); macOS `.app` + `.dmg` per architecture (Developer ID signing, hardened runtime, notarization/stapling); Linux `.deb` or signed archive/checksums. Signing commands/checklist: `resources/signing.md`. No external distribution until signing, native dependency inventory, licensing and clean-machine gates pass. Future updates require signed versioned metadata, atomic replacement, compatibility checks and rollback; never execute partial unsigned downloads. Auto-update is not implemented.
