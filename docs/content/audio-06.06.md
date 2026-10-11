# Audio asset contract and integrity — 06.06

Authored audio is application-owned offline content. `/audio/rs/example.mp3`
resolves only beneath `public/audio`; no authored filesystem paths, remote URLs,
encoded traversal, query strings or fragments are accepted. Examples remain
illustrative and excluded from production discovery. The learner bank, bootstrap,
scoring, IndexedDB schema and recording/STT preprocessing remain unchanged.

## Publication and supported media

Schema v1 now requires `audio.sha256` on any active/retired item with audio,
including optional Read Aloud audio. Draft hashes remain optional. The runtime
validator and generated JSON Schema enforce the same rule. The general AudioAsset
TypeScript shape retains optional fields to represent unfinished drafts. No source
metadata is filled in, repaired or rewritten by validation.

The initial allowlist is deliberately MP3 only: lowercase `.mp3`, MP3 container,
`mp3` codec and `audio/mpeg` MIME. Exactly one audio stream and no additional
streams are allowed; mono/stereo, integer sample rates from 8–96 kHz. This is
exercise playback content, not the 16 kHz learner-recording preprocessing contract.
Future formats require explicit policy, tests and reviewed decoder settings.

Implementation safety limits are 20 MiB per file and 180 seconds per asset,
not official PTE restrictions. Empty, nonregular or symlink files fail. A declared
SHA-256 must match actual bytes. A declared MIME must match the inspected container.
Duration must be positive/finite and match the probe within `max(100 ms, 1%)`.
Missing published duration emits `AUDIO_DURATION_UNDECLARED`, rather than guessing.

Changing published audio bytes requires a new hash and an item revision increase.
Stale hashes fail builds; equal-revision semantic mutation is rejected by the sync
engine. This step does not introduce a historical revision archive or infer revision
increments from source-control history.

## Filesystem and native boundary

Resolution checks every parent directory and uses path-relative containment rather
than string-prefix authorization. Regular files are opened with `O_NOFOLLOW` and
`O_NONBLOCK` where supported. Hashing reads bounded 64 KiB blocks; device/inode,
size/mtime/ctime identities are checked on the open handle and path around probe
and decode. Native tools are also checked for executable, regular-file and stable
identity properties using the existing runtime helper.

`runtime/src/nativeProcess.mjs` supplies `shell: false`, sanitized environment,
closed stdin, 64 KiB stdout/stderr limits, a 30-second deadline per tool, TERM then
bounded KILL escalation, awaited completion and POSIX process-group cleanup.
ffprobe/ffmpeg receive fixed flags, a validated absolute local input internally,
file-only protocol whitelist, forced MP3 demuxer, 1 MiB probe budget, bounded
allocation and no interactive input. Returned diagnostics contain item IDs,
authored `/audio/...` paths and stable issue codes, never native stderr/absolute paths.

ffprobe inspects duration, format, codec, channels, sample rate and every stream.
ffmpeg fully decodes short accepted audio to null with `-xerror`. An additional
181-second decode cap protects against misleading duration metadata; reported
actual decoded time above 180 seconds is rejected, never accepted as a truncated
success. Failed probes/decode/timeouts reject the asset.

These flags constrain protocol/demuxer use; they are not an OS sandbox. Native
decoders and system shared libraries remain trusted dependencies. Development
uses fixed `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` on Linux. Windows/macOS resolve only their fixed `.local-packaging/inputs/<target>/native`
location; their actual native execution remains unvalidated here. Native builders
may also pass reviewed staged binaries through the internal media API; authored
JSON and the CLI cannot select executable paths or URLs. Packaging revalidates
staged audio with its owned native tools before artifact inventory is generated.
Windows/macOS native validation remains pending under Activity 05 gates.

Identity checks detect ordinary mutations but cannot eliminate every native
path-open TOCTOU race against a malicious same-user process. Authoring/package
roots must be trusted and stable during the build. No claim is made about securing
a compromised OS account or attesting every dynamically linked library.

## Build, reports and caching

`content:build` and `content:stats` use structural/batch validation, then audio
integrity, then canonical serialization. Failure happens before output installation,
so the last-good bundle/manifest remain intact. Audio inspection results are not
injected into the canonical JSON; authored hashes are the published identity.
The existing manifest contract and deterministic content hash are unchanged.

A per-build resolved-path cache hashes/probes/decodes each shared file once;
each item's hash, MIME and duration declarations are still compared individually.
Validation runs sequentially, with no unbounded native spawning. Reports include
asset paths, exact bytes, hashes, duration, format, codec, rate and channels.
`validatedAssets` counts successfully inspected bytes; declaration errors still
make `success` false. Statistics distinguish referenced assets, inspected assets,
missing references, total bytes/duration and format/codec counts.

Managed audio-tree traversal is bounded (16 levels, 40,000 entries), rejects
symlinks and reports unreferenced files as `AUDIO_ORPHAN` warnings. The current
11 legacy files legitimately appear orphaned in the technical-draft catalog.
Only explicit system placeholders `.gitkeep`, `.DS_Store`, `Thumbs.db` are ignored.

Commands:

```bash
npm run content:validate                 # structural examples only
npm run content:build                    # production sources + integrity
npm run content:stats
npm run content:verify                   # canonical generated pair/hash/counts
npm run content:verify-audio             # production audio report
npm run content:verify-audio -- --legacy # additionally inspect 5 WFD + 6 RS files
```

`content:verify` deliberately verifies the generated pair independently of source
media; build and package staging enforce actual media integrity. The optional
legacy adapter reads existing TS `audioUrl` references, inspects real files and
records actual identities without modifying those definitions or inventing revisions.
Legacy content is not retroactively claimed to have published canonical hashes.

## Evidence and deferred work

`tests/content-audio.test.mjs` covers real synthetic MP3 probe/full decode,
corruption/truncation, resolution/links, size bounds, hash/MIME/duration mismatch,
stream/codec/layout policy, per-reference comparison with cached inspection,
bounded child termination, orphan warnings and last-good output preservation.
Existing build determinism fixtures now reference real synthetic fixture bytes.
The fixture tone is test-only, generated without learner/copyrighted recordings.
The archived readiness report is `audits/audio-06.06.json`; it reports content
assets, not speech-model quality or platform browser validation.

Deferred: migration of the 17 learner questions, audio generation/transcoding,
importer/ID allocation, new task types and study sessions. Human model selection,
true clean-machine testing and Windows/macOS release/signing remain pending.

## Validation result — Linux development host

PASS: 582 app/runtime tests, 6 package tests, 225 focused content tests with the
packaged Node 24.21.0 LTS interpreter, production frontend build, lint without
warnings, all content commands and `git diff --check`. The 40 audio-specific tests
include mutation during decode and decoded-duration amplification. Package staging
rejects missing or tampered question audio before publishing catalog files.

Legacy readiness: PASS for all 5 WFD and 6 RS files, with SHA-256, ffprobe metadata
and full decode evidence archived locally in the committed audit report. This is
Linux-host validation, not a clean-machine or Windows/macOS support claim.

06.06 is complete within its content-infrastructure scope. The learner-facing
17-item bank is intentionally unchanged, and its future canonical metadata
publication belongs to 06.08. Activity 05 human speech and release/platform gates
remain PENDING.
