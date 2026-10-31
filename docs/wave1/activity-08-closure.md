# Activity 08 — PTE Tasks Wave 1 Closure

**Status: COMPLETE**  
**Verified:** 2026-10-25 (Australia/Sydney)  
**Source commit:** `44d674e3728bf569d58cb4acb3cfe3019ae4745b` (working tree contained closure-only test and package-smoke updates)  
**Content version:** `sha256:246d400e68562495a7d492682ac53555994ef1b67266c4bd484078e70d4fde28`

## Scope

Activity 08 added six Wave 1 tasks to the existing content → exercise → Attempt/Error/Review → session → summary platform. All nine catalogue tasks are practice-ready. No Wave 2 tasks, mock exam, adaptive scoring, Review Queue UI, or Error Lab UI were added.

## Implemented tasks

| Task | Practice family | Local feedback boundary |
| --- | --- | --- |
| Write From Dictation | Listening + typed transcription | Word-level deterministic accuracy |
| Repeat Sentence | Listening + spoken repetition | Content recall and sequence/chunk diagnostics; local fluency where available |
| Read Aloud | Reading + spoken response | Text coverage and local fluency diagnostics |
| Retell Lecture | Long audio + spoken synthesis | Authored key-point lexical coverage and local fluency diagnostics |
| Summarize Group Discussion | Multi-speaker audio + spoken synthesis | Key-point, authored speaker contribution, relationship, and local fluency diagnostics |
| Describe Image | Image + spoken response | Authored key-feature lexical coverage and local fluency diagnostics |
| Summarize Written Text | Passage + typed response | Local Form gate, key-point evidence, source-copy diagnostics |
| Summarize Spoken Text | Audio + typed response | Form band multiplied by key-point evidence |
| Highlight Incorrect Words | Audio + token selection | Exact authored-truth +1/−1 rule, floor zero |

Internal task metrics are practice diagnostics. The app does not claim to reproduce Pearson Content, Pronunciation, Oral Fluency, Grammar, Vocabulary, Spelling, or overall PTE scores. HIW raw points follow the published item rule but are not a Listening/Reading section score.

## Content inventory

| Task | Active learner items |
| --- | ---: |
| Write From Dictation | 5 |
| Repeat Sentence | 6 |
| Read Aloud | 6 |
| Retell Lecture | 4 |
| Summarize Group Discussion | 3 |
| Describe Image | 4 |
| Summarize Written Text | 4 |
| Summarize Spoken Text | 4 |
| Highlight Incorrect Words | 5 |
| **Total** | **41** |

Content schema is v2; there are 23 unique local MP3 assets (8,387,063 bytes) and 4 validated local JPEGs (215,069 bytes). Repeated content references to a shared audio path are intentional. Technical fixtures are excluded from the generated learner bank. `contentVersion` remained stable across repeated builds. The validator reports no errors; it retains existing duplicate-prompt/audio-reference warnings for review.

## Session integration

- Registry and dispatcher cover all nine ready task types; each has a specific Attempt persistence path and task-specific summary aggregator.
- Task Practice capacity derives from installed content. Mixed Practice supports all nine tasks, preserves canonical interleaving, and redistributes capacity without duplicate IDs.
- Quick Practice intentionally remains WFD / RS / RA.
- HIW selections are persisted as typed `Attempt.responseData`; historical Attempts without that optional field remain supported.
- Dexie remains v3. No Attempt-history rewrite or database migration was needed.
- All-nine Max Mixed queue validation produced 41 unique items in canonical task order. A single 9-item all-task completion run was not performed; dedicated task suites and representative cross-family mixed transitions cover completion and summary behavior without one brittle monolithic browser test.

## Validation results

### Content integrity

- `content:validate`: PASS, 41 files, zero errors.
- `content:build`: PASS, 41 active items, zero errors; content version stable.
- `content:verify`: PASS, schema v2, 41 items, 23 audio assets, 4 images.
- `content:verify-audio`: PASS, all 23 unique assets present, decoded, and within task policy.
- `content:verify-images`: PASS, all 4 hashes, byte counts, MIME types and dimensions verified.
- `content:stats`: PASS, 41 active / 0 draft / 0 retired; 8,387,063 audio bytes and 215,069 image bytes.

### Automated and build checks

- `npm test`: **1,162 passed, 0 failed**.
- `npm run build`: PASS. Vite reports the existing 716.40 kB minified main-chunk warning; no closure-only code splitting was added.
- `npm run lint`: PASS.
- `npm run package:test`: **7 passed, 0 failed**. The loopback package test required execution outside the sandbox; the approved rerun passed.
- `git diff --check`: PASS.

### Browser product integration

All six Wave 1 task browser suites passed, and all six session suites passed: exercise-session, Quick, Task, Mixed, navigation, and summary. Browser version was Chrome 154.0.8037.97. Across the suites, page errors and unexpected external requests were zero. Evidence is retained in the per-task browser audit files under `audits/` and summarized in [wave1-08.08-browser-closure.json](../../audits/wave1-08.08-browser-closure.json).

The closure run corrected two stale browser assertions that assumed the smaller pre-Wave-1 selector set. Retell Lecture Mixed selection now explicitly retains only WFD + Retell Lecture; the SST Mixed test explicitly deselects HIW when validating SWT/SST transitions.

### Packaged/offline integration

The current unsigned Linux x64 package was rebuilt from the closure source/content state. Its host smoke passed the launcher, `/study`, all nine standalone routes, session route, all 23 unique local audio files, all 4 local images with hashes, local Whisper inference, same-origin policy, single-instance, restart/quit, shutdown during inference, and process cleanup.

A packaged Chrome run additionally completed a 3-item SWT Task Practice session and summary, followed by a 5-item SWT/SST Mixed session and summary. It used Dexie v3, had zero page errors and zero external requests. Packaged browser checks exercised actual MediaRecorder, bundled decoder and Whisper for RS/RA; a separate Retell Lecture run also passed the MediaRecorder → bundled decoder → local Whisper path with `processedLocally: true`. IndexedDB persistence across runtime restart passed in the RS/RA package smoke. This is technical-path evidence, not human microphone/model-quality evidence.

Package details and hash are in [wave1-08.08-package.json](../../audits/wave1-08.08-package.json). The package smoke identifies itself as an internal host validation; no clean-machine certification is implied.

## Known limitations and deferred gates

These remain Activity 05 release/human-validation gates, not Activity 08 feature failures:

- human learner STT benchmark;
- physical microphone certification;
- clean-machine Linux validation;
- Windows and macOS package validation;
- signing/notarization.

The local lexical coverage heuristics do not understand semantic paraphrase reliably. Whisper is not used as a pronunciation scorer. Task-level internal scores are not official Pearson scores. No all-nine-task session was completed end-to-end in one browser run, although all-nine queue construction, each task family, task-specific summaries, and representative transitions passed.

## Final status

| Step | Status |
| --- | --- |
| 08.01 Wave 1 Scope + Contracts | COMPLETE |
| 08.02 Retell Lecture | COMPLETE |
| 08.03 Summarize Group Discussion | COMPLETE |
| 08.04 Describe Image | COMPLETE |
| 08.05 Summarize Written Text | COMPLETE |
| 08.06 Summarize Spoken Text | COMPLETE |
| 08.07 Highlight Incorrect Words | COMPLETE |
| 08.08 Integration + Validation Closure | COMPLETE |
| **Activity 08 — PTE Tasks Wave 1** | **COMPLETE** |

Next: **Activity 09 — PTE Tasks Wave 2**, beginning with catalogue audit, interaction/scoring-family classification, implementation ordering, and current Pearson fact verification.
