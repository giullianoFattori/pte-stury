# 07.07 — Mixed Practice

## Study configuration

Mixed Practice is a third section on `/study`, alongside Quick, Task and the existing standalone links. All three tasks are selected by default, in canonical WFD/RS/RA order. Native checkbox, difficulty-radio and count-radio groups support keyboard use. At least two tasks are required to start.

Counts are **5 / 10 / Max**. Default selection prefers 10 when available, then 5, otherwise Max. Max becomes an explicit positive integer before the domain call. The existing 500-item limit is respected: larger Max pools are disabled rather than silently truncated. Difficulty is global: Any omits the filter; 1/2/3 map to one exact difficulty. There are no per-task weights/counts or balancing switches.

`mixedPracticeCapacity` issues bounded parallel count queries, one for each selected task, through the existing practice repository. It derives the total by summing these disjoint task pools. Per-task and total availability are displayed. React does not load the catalog to count it and does not infer eligibility.

Every selected task must have eligible content. An empty selected task produces a warning and blocks Start, even if the other pools have enough questions. The learner can deselect it or change difficulty. Changes invalidate old count state immediately, reset the UI count default and ignore late responses. Storage failures display an authored error with retry. If content changes during Start, a failed request reloads capacity and requires a fresh count choice; it never silently shrinks the queue.

## Builder and persistence reuse

`startMixedPractice` validates the config and delegates canonical task-order normalization to `validateBuildRequest`. Duplicate/unknown tasks, fewer than two tasks, malformed count/difficulty and unknown fields are rejected. Pure domain APIs and their count semantics are unchanged.

Creation goes through the shared `startPracticeSession` and installed contentVersion/UUID/clock/RNG dependencies. A product gate checks selected-task coverage against the retrieved eligible candidates, using the existing eligibility predicate. It runs only when preparing a new session: existing active Quick/Task/Mixed sessions still resolve to Resume. A concurrent catalog mutation remains subject to repository verification before commit.

The existing 07.02 builder exclusively owns balanced shares, canonical remainder order, capacity redistribution, per-task sampling and round-robin interleaving. No allocation algorithm or preview is implemented in the feature layer. For the current bank, all three tasks + 10 yields 4/3/3; five yields 2/2/1. The existing synthetic allocation case 1/5/5 with request 6 yields 1/3/2.

The single Study-page `useActiveStudySession` controller now serves all three cards. It guards simultaneous clicks and exposes Resume after a cross-tab creation race. Active sessions disable new mode starts; none is abandoned or replaced automatically.

## Generic runner

Mixed uses the existing `/study/session/:sessionId`, `StudyItemExercise`, exercise identity and atomic outcome/progress path. Saving advances storage while keeping feedback visible. Continue re-reads storage; refresh opens the persisted next task. Changing items/tasks runs the existing recording/microphone/transcription cleanup. Completion now says **Mixed Practice complete**, including direct reload. No full summary is added.

Scoring, speech algorithms/model, content, persistence schema and indexes are unchanged. Dexie stays v3. Explicit abandon/navigation polish remains 07.08; summary remains 07.09. There is no adaptive/mastery/review/error selection.

## Validation

- `tests/mixed-practice.test.mjs`: all task pairs, all-three 10 and Max, canonical input ordering without mutation, actual 4/3/3 allocation and interleaving, global difficulty purity, invalid inputs, product zero-capacity gate, active Quick/Task/Mixed Resume, concurrent Task/Mixed creation, count policy, count-query mapping, and synthetic redistribution/exact capacity/insufficiency through the existing builder. Existing 07.02 tests continue covering selection/queue invariants.
- `npm run test:mixed-practice-browser`: actual app/StrictMode/IndexedDB/MediaRecorder/Web Audio in Linux Chrome with controlled HTTP STT. Covers default selection, fewer-than-two blocking, capacity changes, difficulty/presets, deliberately delayed old capacity responses, selected zero-capacity blocking/deselection, Max=17, five-item WFD → RS → RA → WFD → RS completion, feedback/Continue, refresh from saved WFD into RS, microphone track cleanup, fresh speech/recording/RA preview state, completed-route reload and active Mixed Resume. Audit: `audits/session-07.07-browser.json`.
- Regression suites: `test:quick-practice-browser`, `test:task-practice-browser`, `test:exercise-session-browser` (standalone WFD/RS/RA and session adapter).

Browser suites use independently installed Playwright via `PLAYWRIGHT_MODULE`. Controlled speech is pipeline evidence only; it does not certify a physical microphone, human recognition quality, clean-machine deployment or packaged platform. Activity 05 release gates and 07.10 packaged session validation remain separate.

Validation result: **877 application/runtime tests PASS**, **7 package tests PASS**, TypeScript/Vite build PASS, lint PASS, `git diff --check` PASS. Mixed, Quick, Task and reusable-exercise Chrome suites passed with zero page errors and zero unexpected remote requests.
