# Activity 06.08 — Canonical migration and scale validation

Activity 06 status: **COMPLETE** for the implemented local content system. The 17
existing learner questions now have one editable production source:
`content/<task>/<id>.json`. Derived generated JSON is committed and installed by
`bootstrapApp()` → `initializeQuestionBank()` → transactional IndexedDB sync.
The four legacy bank/seed modules are removed. Scoring, speech models, exercise
behavior and the Dexie v3 index schema are unchanged.

Activity 05 remains **PARTIALLY COMPLETE**: human model comparison, physical
microphone certification, true clean-machine and Windows/macOS validation, and
release signing remain PENDING. This content closure does not close those gates.

## Identity and semantic parity

| Task | Permanent learner IDs | Active items | Authored skills |
| --- | --- | ---: | --- |
| Write From Dictation | wfd-001 … wfd-005 | 5 | listening, writing |
| Repeat Sentence | rs-001 … rs-006 | 6 | listening, speaking |
| Read Aloud | ra-001 … ra-006 | 6 | reading, speaking |

All items declare `revision: 1`, `status: active`, `source: internal`. Revision 1
means first canonical published revision; it does not backfill historical Attempts.
Provenance preserves existing repository-authored content; no external commercial
bank was imported. Tags/topics were not invented. Explicit skills cover all 17.

The frozen historical snapshot under `tests/fixtures/content-migration` proves exact
parity for ID, task, difficulty, prompt, answer, transcript, chunks, phrase groups,
stress words and audio path. It is used only by historical tests. Controlled speech
and POC tools obtain their question views from generated content, not another
editable bank. Fourteen duplicate-prompt warnings are intentional shared task
instructions; the wording was preserved rather than rewritten to suppress warnings.

Technical `*-900001` drafts moved to excluded `content/examples/technical`.
Their IDs and the entire technical range remain permanently reserved. Fresh installs
have 17 rows/17 eligible items/zero technical items. If an older diagnostic database
installed technical drafts, sync retains their historical rows as unavailable;
practice still contains exactly 17 items.

Content version:

```text
sha256:bd666658b8e96465a676daf4881e8bb7c8322a1165b11fd14936e873a6b837c2
```

## Audio and package integration

All 5 WFD and 6 RS MP3 files were measured, hashed, probed and fully decoded.
Canonical metadata contains actual lowercase SHA-256, rounded duration milliseconds
and `audio/mpeg`. Total audio is 429,582 bytes / 53,520 ms. RA has no fabricated audio.
Declared identity/duration checks and complete packaged decode passed for all 11.

Activation exposed a packaging gap: the previously limited ffmpeg build lacked
MP3 inspection and the null/progress output required by content validation. The
pinned LGPL-only/network-disabled build now explicitly enables MP3 demux/decoder,
mpegaudio parser, null muxer and local pipe output. This changes no learner STT
preprocessing arguments or Whisper decoding/model selection. The package still owns
and inventories decoder binaries/libraries, model, frontend, content and audio.

| Component | Bytes |
| --- | ---: |
| Canonical source JSON | 12,856 |
| Generated bundle | 14,743 |
| Content manifest | 270 |
| Question audio | 429,582 |
| Linux internal archive | 185,507,208 |

The historical 05.10 archive was 185,447,656 bytes: +59,552 bytes. This comparison
includes changes since that historical package and is not a content-only causal
delta. Exact archive/manifest hashes and build identity are in
[audits/content-06.08.json](../../audits/content-06.08.json). The measured archive was
built from the recorded parent Git commit with a dirty tree; it is explicitly
identified by hashes, not represented as a clean committed release build.

## Persistence, recovery and browser evidence

Unit integration tests exercise fresh install, v2/v3 adoption of all 17 identities,
preserved `createdAt`, no-op repeat launch, technical-row omission, transactional
rollback, invalid updates and previous-bank fallback. Attempts, Errors, Reviews and
Sessions are compared without rewriting them. A failed update preserves the previous
valid catalog and displays a controlled warning. A fresh initialization failure
shows a controlled startup message. The old seed never runs after sync.

Actual Linux Chrome 154.0.8037.97 validated:

- Fresh generated-catalog install: 17 eligible rows and contentState, no technical IDs.
- Real IndexedDB v2 upgrade, unchanged synthetic history and legacy timestamps.
- Easy/medium/harder RA and short/medium/long RS, plus a partial RA utterance.
- Actual MediaRecorder, packaged ffmpeg/Whisper, audio playback and fluency analysis.
- Explicit saves: 8 attempts, 10 ErrorRecords, 3 ReviewItems in the controlled suite.
- All new attempts carry revision 1; old synthetic attempts retain unknown revision.
- WFD playback/perfect scoring plus a separate wrong-answer Error/Review test.
- Reload/tab reopening, runtime restart and reinstall into another package directory.
- A disk-backed profile seeded as v2, full Chrome process restart before upgrade,
  then full Chrome/runtime restart after saving; catalog and all learner tables match.
- Same origin `http://127.0.0.1:8765`, zero normal-flow page/CSP errors or remote
  application requests, CSP remote script/connect blocking, no answer in STT requests.

Evidence: [packaged browser](../../audits/content-06.08-browser.json),
[disk persistence](../../audits/content-06.08-browser-persistence.json),
[offline isolation](../../audits/content-06.08-offline.json).
Browser profiles/history were isolated synthetic fixtures, not private user data.
Recorded speech was controlled TTS injected into Web Audio; it is not human accuracy
or physical microphone certification.

Offline filesystem/network isolation loaded the 17-item catalog, served all 11 audio
assets and transcribed RA/RS without host Node/ffmpeg or internet. Bubblewrap on this
host is useful evidence, not a clean VM. Package smoke verified single-instance,
port collision, restart, quit-during-inference and no orphan native processes.
Verification took 303 ms, readiness 3,520 ms and first transcription 2,497 ms in that
smoke run. Temp cleanup passed after the disk-backed browser/runtime shutdown.

## Scale evidence and index decision

Synthetic source files and databases are test-only and deleted after validation.
No synthetic learner questions or normal IDs were installed/reserved in production.
All sizes passed discovery/validation/build/verification, four sync transactions
(fresh, no-op, subset revision update, availability update), history preservation,
indexed task/difficulty/metadata queries, counts and injected-RNG sampling.

| Items | Full build ms | Verify ms | Fresh sync ms | No-op ms | Bundle bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 526.513 | 24.844 | 77.578 | 18.719 | 427,221 |
| 5,000 | 2,551.223 | 106.266 | 254.103 | 84.616 | 2,149,221 |
| 10,000 | 4,215.802 | 239.017 | 510.964 | 171.435 | 4,301,724 |

These sync figures use fake-indexeddb. Its 10k task/metadata/count scans took roughly
36–38 seconds and are explicitly not browser performance truth. Raw phase timings,
updates, availability changes and query timings are archived in
[scale evidence](../../audits/content-06.08-scale.json).

The actual Chrome IndexedDB source-module harness measured:

| Items | Fresh sync ms | No-op ms | Task query ms | Difficulty ms | Metadata ms | Count ms | Sample ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 98.8 | 15.5 | 56.8 | 22.3 | 51.4 | 51.2 | 0.2 |
| 5,000 | 400.8 | 63.3 | 260.4 | 120.9 | 292.9 | 303.9 | 0.1 |

This is real IndexedDB with the application sync/query code; the isolated profiling
harness uses Vite to serve source modules, while product regression uses the actual
production package. Fresh sync measures content installation, not full large-bank UI
startup. The 17-item packaged page readiness measurement is in the browser audit.
Approximate page JS heap increased about 4.0 MB at 1k and 9.0 MB at 5k; it includes
module/catalog allocations without forced GC and is not a leak/RSS measurement.

**Keep Dexie v3.** The measured Chrome workload does not establish a need for new
indexes. No arbitrary acceptance threshold is declared. More devices/browsers and
the later session-engine workload may justify targeted indexes. No-op avoids content
writes/scans but still performs structural validation; it is not constant-time in
catalog size. Exact old wording/audio is not archived by `itemRevision` alone.

## Reproduction and checks

```bash
npm run content:validate
npm run content:verify-audio
npm run content:build
npm run content:verify
npm run content:stats
npm run content:ids
npm test
npm run build
npm run lint
npm run package:test
npm run package:linux
npm run content:audit-scale
npm run content:audit-browser-scale
npm run content:audit-package
npm run content:audit-persistence
npm run content:audit-offline
node tools/content-validation/report.mjs
git diff --check
```

Browser audit tools need test-only Playwright (`PLAYWRIGHT_MODULE` may select its
installed module) and `/usr/bin/google-chrome`; neither is a learner runtime
requirement. Extract the built archive and set `PACKAGE_VALIDATION_ROOT` to its
`PTE-Study` directory for package/offline/report audits. Go launcher tests, runtime
tests, locked dependency installation, native builds and package smoke also run in
`package:linux`. Reports contain no learner transcript/audio or private filesystem
paths. Generated source/schema parity, all 656 final application/runtime regression tests
and 7 package tests passed. The internal package build also ran its Node LTS and
Go launcher regressions successfully.

Activity 07 may now build session selection on this canonical content/query layer.
Review/Error UI, mastery, adaptive scheduling, content expansion, human speech-model
selection and cross-platform release certification remain separate work.
