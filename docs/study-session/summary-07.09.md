# Activity 07.09 — Session Summary + Basic Results

Completed `/study/session/:sessionId` routes now show a practice summary derived from the persisted session and its exact `attemptIds` ledger. Abandoned routes retain the ended-state UX. Active exercises, saved-feedback/Continue, leave/resume, End confirmation, scoring, speech runtime and allocation are unchanged. Dexie remains v3.

## Data boundary and integrity

`getSessionSummary` loads the parsed session, then `attemptsRepository.getByIds` uses Dexie `bulkGet`. Requested order and missing slots are preserved; it never scans historical Attempts or reads current StudyItems/contentState. The injected repositories support isolated testing. No summary aggregates are persisted.

`buildSessionSummary` is pure, deterministic and returns frozen results. It reuses the authoritative session parser, requires completed state with a full queue/ledger, validates ordered Attempt IDs, each queued item/task, and any supplied `Attempt.sessionId`. Historical Attempts without sessionId remain compatible if the authoritative ledger and queue agree. Unreferenced standalone/other-session rows cannot enter the calculation.

Missing referenced rows produce `SESSION_SUMMARY_INCOMPLETE`; malformed session state, wrong ordering/linkage, missing required metrics or invalid measurements produce `SESSION_SUMMARY_CORRUPT`. Required counts are nonnegative safe integers, expectedWords must be positive, correctWords cannot exceed expectedWords, percentages must be finite in 0–100, exact-match values must be booleans, and measured time/rate values must be finite and nonnegative. Aggregate count overflow fails safely. Only metrics consumed by the summary are interpreted; unrelated diagnostic metrics are not re-scored. No invalid value is converted into zero. A failed detailed summary shows an authored safe error with Retry and Back to Study; no partial averages are displayed or raw storage details exposed.

The wall-clock duration is `finishedAt - startedAt`, using the lifecycle parser's valid ISO timestamp and nonnegative interval checks. Attempt.durationMs is not session duration. Display floors to whole seconds below an hour (`45 sec`, `3 min 12 sec`) and whole minutes at/above an hour (`1 hr 8 min`). The model retains raw milliseconds.

## Aggregation policy

Each card derives its question count from resolved Attempts, in canonical WFD/RS/RA order. Tasks absent from the session have no card.

- **WFD:** word accuracy is `100 × sum(correctWords) / sum(expectedWords)`. Shows correct/expected words, total errors and exact-match count.
- **RS:** content recall uses the same expected-word weighted ratio. Sequence accuracy is the expected-word weighted mean of the persisted sequence percentages, retaining their source rounding precision. Errors and exact-content counts are summed. Chunk retention is `100 × sum(retainedChunks) / sum(totalChunks)` over responses with positive totalChunks; absent pairs or zero totalChunks mean unavailable analysis. Incomplete, fractional or inconsistent chunk pairs fail. The card states how many responses were analyzed.
- **RA:** text coverage uses the weighted correct/expected ratio; persisted textCoveragePercent is also required and range-validated. Errors/exact-text counts are summed. Speech ratio, long-pause count and response latency use per-response arithmetic means. Speech rate averages only explicitly available finite measurements and states the measured response count. Missing rates never become zero.

Percentages and wpm display rounded integers; average long pauses uses one decimal; latency uses rounded milliseconds. Exact booleans display counts such as “2 of 4 exact”. These task constructs are never averaged across tasks. The UI explicitly states: **These are practice metrics from this app, not an official PTE score.** There is no official overall score, adaptive recommendation, Error Lab or Review Queue.

## Validation evidence

- `tests/study-session-summary.test.mjs`: weighted WFD/RS/RA metrics with varied sentence lengths; sequence/chunk handling; unavailable rate exclusion; mixed task grouping; immutable/non-mutating output; seconds/minutes/hours; missing, duplicate, reordered and mismatched ledger entries; malformed metrics/timestamps/completion; exact bulk order and missing slots. Real outcome factories exercise all three tasks in an isolated DB; summary remains valid after catalog removal and performs no outcome writes.
- `npm run test:session-summary-browser`: actual Chrome application routes, StrictMode, IndexedDB, MediaRecorder and Web Audio, with controlled local STT HTTP. Completes five Quick items (2 WFD / 2 RS / 1 RA), checks 100% content cards and disclaimer, reload stability, current-catalog independence, isolation from an invalid unreferenced Attempt, missing-Attempt safe error and Retry recovery, and Back to Study. Audit: `audits/session-07.09-browser.json`.
- Regression commands: `npm test`, `npm run build`, `npm run lint`, `npm run package:test`, `git diff --check`; navigation, Quick, Task, Mixed and exercise-session Chrome suites.

Browser speech is controlled technical evidence, not physical microphone or human recognition quality evidence. Full packaged session certification belongs to 07.10. Activity 05 Windows/macOS, clean-machine, signing and human-model gates remain separate.

Validation result: **995 application/runtime tests PASS** (including 109 new summary tests), **7 package tests PASS**, build PASS, lint PASS and `git diff --check` PASS. The existing Vite warning about the main bundle exceeding 500 kB remains. Navigation, Quick, Task, Mixed and exercise-session Chrome regressions PASS with zero page errors and unexpected remote requests; the new summary audit also records PASS.

Harness limitation observed: two runs timed out waiting for the initial Study CTA during Vite startup; diagnostic reruns completed successfully with zero page errors. The recorded PASS is from the completed run, rather than treating those startup timeouts as summary evidence. This remains a development-harness startup sensitivity; packaged end-to-end validation is reserved for 07.10.
