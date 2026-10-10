# Activity 05.09 — packaging implementation and release status

Production static serving, packaged resolution, artifact inventory, native launcher and an internal Linux x64 package are implemented. **Step 05.09 is not fully closed across platforms**: Windows/macOS native packages/installers and clean-machine validation remain pending. No commercial/platform-wide support claim is made.

The chosen architecture is a Go standard-library native launcher plus bundled Node 24.21.0 LTS and the existing ESM runtime. React is served directly by the runtime at `http://127.0.0.1:8765`; Vite is development-only. Separate app/runtime/API/engine/model versions are carried by the package inventory. System-browser tabs do not define lifetime: the launcher holds the runtime until explicit Quit. See [build and operating instructions](../../packaging/README.md).

| Workstream | Status |
| --- | --- |
| 09.1 same-origin static serving, fixed MIME, manifest allowlist, CSP, API isolation | Implemented and tested |
| 09.2 development/packaged resolvers and complete SHA-256 inventory | Implemented and tested |
| 09.3 native launcher, instance lock, ready/error polling, Quit, tree ownership | Linux exercised; Windows/macOS backends cross-compiled only |
| 09.4 internal Linux x64 bundle | Built and host-smoked; clean-machine installation pending |
| 09.5 Windows x64 | Launcher compiled; matching-host staging gates provided; native acquisition/MSVC pinning/MSI and smoke pending |
| 09.6 macOS x64/arm64 | Launchers compiled; matching-host staging gates provided; SDK pinning/native inputs/.app/.dmg and smoke pending |
| 09.7 signing/notarization | Order, commands and requirements documented; credentials/release jobs pending |
| 09.8 clean-machine/update/reinstall smoke | Procedure documented; clean machines and actual update/reinstall validation pending |

## Security and lifecycle

The launcher validates the inventory before executing the owned Node binary. The packaged runtime rechecks the target/interpreter and resources; it accepts no model/native/static paths over HTTP or public config. Static serving opens only inventoried regular files, checks recorded identities, rejects traversal/query variants, isolates `/api`, and falls back only for actual React routes. API v1 remains unchanged.

The CSP permits local scripts/styles/connects, local/data images and local/blob media; it forbids objects, framing and base overrides. No `unsafe-inline`, remote scripts or remote connections are enabled. Browser smoke validates the built UI with that policy.

POSIX uses flock and a dedicated runtime process group; packaged native children inherit that group so a launcher hard kill covers the entire tree. Development/benchmark processes retain their original native group behavior. Windows uses a per-user mutex and Job Object with kill-on-close; a stdin startup gate defers Node/native work until Job assignment succeeds. Quit is cooperative first, then bounded hard termination. Launcher pipe loss initiates shutdown and a POSIX group fallback. Windows/macOS behavior still requires actual OS tests, including ACL/DLL loading, launcher crash and native descendants.

A private random-token local control channel supports only open/ping/quit with one-second read deadlines, bounded messages and eight concurrent handlers. It is separate from the browser/API origin boundary. The same-user malicious-process limitation from the threat model remains; a token does not solve OS account compromise. Package hash verification is corruption detection until the installer/inventory has an authentic signature.

The launcher strips inherited Node/proxy/loader overrides before interpreter execution. Native decoder library search is internally fixed to the verified package `native` directory; no user env override is inherited. FFmpeg and Node GCC runtime libraries are inventoried; glibc/OS loader remain an explicit system-runtime boundary, not an OS sandbox or attestation of every host library. File mutation between validation and use remains a race against same-user package modification. OS swap/core dumps may contain memory; no transcript/audio is logged or retained by the runtime by default.

## Inputs, licensing and model

[source locks](../../packaging/sources.lock.json) pin Node 24.21.0, Go 1.27.2, Whisper v1.8.3/revision, FFmpeg 8.0.3 source hash and baseline model identity. Linux records GCC 13.3.0/CMake 3.31.6 and CPU flags. This is reproducibility metadata with pinned inputs; bit-identical builds across different compiler/OS versions are not claimed. Windows/macOS compiler/SDK pins must be supplied before release.

FFmpeg is built from official source with GPL/nonfree/network/autodetect disabled, shared LGPL libraries and no external codec libraries. Native Opus/Vorbis/AAC/PCM/FLAC decoding covers intended recorder formats; actual Windows Edge/Chrome and macOS Chrome/Safari still need media fixtures captured on those systems. The installed GPL-enabled Ubuntu build is not copied. Actual license texts, Node bundled notices, Go, Whisper/OpenAI model MIT, GCC runtime exception, production npm licenses and FFmpeg corresponding source/build flags are included. CycloneDX inventories production npm, interpreter, engine/ggml, model, launcher standard library and owned native libraries. Final redistribution review is still required.

The internal package bundles `base.en` for offline startup. The human 05.07 corpus remains unavailable: **model choice is pending**, base.en is only the baseline. Commercial model/download UX, model-specific RAM, final inference timeout and installer size policy remain evidence-dependent. No learner scoring, ErrorRecord, ReviewItem, scheduler or IndexedDB schema changes were made.

## Host validation

The Linux host smoke verifies owned dependencies with PATH set unusable and hostile NODE_OPTIONS/loader overrides, readiness, first real controlled transcription, second-instance reuse, explicit Quit, restart and clear fixed-port collision. It also verifies Quit during real inference with no surviving Whisper process. A filesystem-isolation smoke passes with only the package and glibc/OS loader exposed, without host Node, FFmpeg or development tools. Neither substitutes for an actual clean-machine install. Chrome smoke uses real MediaRecorder/Web Audio, package-owned decoders, real Whisper and production UI, saves RA/RS, and checks IndexedDB after runtime restart. No private recording or transcript is committed.

Privacy-safe size/timing/browser results are archived in [packaging audits](audits/packaging-05.09.json). Measurements are observations on this machine, not product acceptance thresholds or a human model recommendation. Existing runtime/app tests, package tests, Go tests, build/lint and diff checks accompany this change. Benchmark tooling still intentionally refuses fabricated metrics without human recordings.

## Remaining external distribution gates

- Native Windows/macOS toolchains/dependencies, true installer assembly, supported OS/CPU matrix and browser formats.
- Clean-machine install/launch/RA/RS/Quit/crash validation without development tools on all four targets.
- Actual signed update/reinstall continuity and explicit uninstall-data policy verification. Stable origin is preserved in implementation; runtime restart continuity is tested.
- Windows Authenticode, macOS Developer ID/hardened-runtime entitlements/notarization, Linux package/checksum signing and authentic release metadata.
- Platform-native tray/menu Quit and safe GUI errors; current internal launcher has terminal/`--quit` interaction.
- Human model comparison; no final commercial RAM/timeout/model size decision.

Step 05.10 may validate the internal Linux product now, but cannot close Activity 05 across packaged platforms until these gates have evidence.

Step 05.10 now archives [identified extracted-package validation](validation-05.10.md): Linux host technical flow, controlled browser RA/RS/WFD, persistence after restart/reinstall, artifact tampering, real timeout/crash recovery and offline namespaces passed. True clean-machine/physical microphone, other platforms, signing and the human model gate remain PENDING. Activity 05 is PARTIALLY COMPLETE. Embedded private build paths found by the artifact scan are an additional external packaging cleanup gate.
