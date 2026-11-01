# Reading: Fill in the Blanks — Drag and Drop (09.04)

## Format and scoring boundary

Verified for implementation on 2026-11-01 from the Activity 09 task brief: Reading-only, passage up to 80 words, no separate task timer, shared word bank with more words than gaps, and partial credit of +1 per correct blank / 0 per incorrect blank. Unused words remain in the bank; a placed word can be moved or returned. There is no negative marking. `Attempt.score` is normalized correct blanks / total blanks and is an internal practice metric, not a section score.

## Content and interaction

Five original active items (`rfbdd-000001`–`rfbdd-000005`) use local authored passages, stable blank IDs, a unique shared word bank, one-use answer values and distractors. Published content validation reconstructs the passage and enforces the 80-word limit plus the word-bank invariants. Content schema remains v2 and Dexie remains v3.

The exercise stores one assignment map keyed by blank ID. Learners may use pointer drag/drop or the accessible keyboard/click alternative: select an unused bank word, then activate a gap. “Move” selects a placed word for reassignment; “Clear” returns it. Replacing a gap returns the prior word to the derived available bank. Submitting with gaps empty is allowed.

Persisted response data is `kind: 'blank-choice'` with every authored blank ID and its selected word or an empty string. The scorer rejects unknown blank IDs, unknown bank values, and duplicate assignment of one word. Wrong selections produce conservative vocabulary errors; omissions produce omission errors. Up to four contextual reviews may be created.

## Integration

The task is available in standalone, Task Practice, Mixed Practice and its own pooled blank-accuracy session summary. The Wave 2 ready count is 3, total ready-task count is 12, and Quick remains WFD / RS / RA. Five items increase the active learner bank from 51 to 56. No audio, speech runtime, timer, microphone, or external service is used.

## Validation evidence

- Content validation/build/verify: PASS; 56 published items, including five Drag and Drop items; schema v2; 28 audio assets and four images verified; no technical fixture included. Final content version: `sha256:24ac1830537c99d6fb70c16cebeb11f7ab64c9d749c5d65e4dd3d987f9ad6d74`.
- `npm test`: 1,188 tests PASS. `npm run build`, `npm run lint`, and `npm run package:test`: PASS (7 package tests).
- Drag and Drop browser flow: PASS in Chrome 154.0.8037.97, including keyboard assignment/move/replace/clear, Task Practice (5), summary, 0 page errors, 0 remote requests, Dexie v3.
- Dropdown/LFB/Drag-and-Drop Mixed transition: PASS in one session; Mixed Practice all-ready Max: 56 unique items across 12 tasks; session summary browser: PASS.
- `npm run package:linux`: PASS. Internal Linux host package smoke served all 12 standalone routes, 56 learner items, five Drag and Drop items, local assets, local runtime and shutdown/restart checks. This remains host validation, not clean-machine or cross-platform certification.

The Vite build retains its existing main-chunk warning (>500 kB); startup/performance showed no material regression.

## Limitations

The exact local blank score follows authored truth and the published per-blank arithmetic. It is not an official PTE Reading section score. The app does not infer why a selected word is wrong beyond its deterministic omission/vocabulary classification.
