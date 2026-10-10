# Release signing handoff

No signing identities or private keys are stored in this repository. Unsigned builds are internal only. The release operator must authenticate reviewed inputs before building, and use platform credential storage.

1. Build/test on the matching pinned target; inventory source/toolchain/compiler/native dependency licenses.
2. Sign binaries that require signing. Regenerate all artifact hashes after signing; verify the inventory. Manifest signature/installer authenticity covers the inventory as well as files.
3. Build the installer/container; sign/notarize that final container, archive exact hashes and smoke results.

Windows: use the Windows SDK `signtool sign /fd SHA256 /tr TRUSTED_TIMESTAMP_URL /td SHA256 /a FILE` on owned PE files, then signed WiX MSI. Verify with `signtool verify /pa /all`. The timestamp endpoint is a release-operator-controlled build input, never runtime configuration. Decide certificate and secure CI key access before activating a release job.

macOS: codesign each owned executable/library with Developer ID and hardened runtime, then assemble/sign the `.app`. Review Node JIT entitlements against the pinned interpreter; do not blindly grant broad entitlements. Submit the signed `.dmg` with `xcrun notarytool submit --keychain-profile PTE_RELEASE --wait`, staple and verify Gatekeeper on a clean machine. Re-hash nested binaries after their signing, before sealing the parent bundle. Verify relative resource layout for the native launcher within the `.app`; the current tar-style layout is not a completed `.app` assembly.

Linux: build the package/archive, produce SHA-256 and sign release checksums/package metadata with the protected release key (`gpg --detach-sign --armor`). Verification requires an independently trusted published key. A checksum distributed beside an unsigned archive is not authenticity.

Future signed update metadata includes app/runtime/API/engine/model versions, exact platform artifact hashes/sizes, minimum compatible origin/schema, rollback target and signature. Updates stage completely, verify before execution, stop the owned tree, atomically switch installation and retain rollback. Browser-origin study data is preserved. No updater executes until these controls and platform tests exist.
