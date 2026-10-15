# 07.04 — Shared exercise session adapter

WFD, Repeat Sentence and Read Aloud now render reusable exercise components. Standalone pages retain their existing content-selection hooks. `StudyItemExercise` dispatches the supplied item to the matching exercise; it performs no scoring or navigation. No session routes or runner UI are introduced.

## Contract

`ExerciseMode` is either `standalone` (the default) or `session` with `sessionId`, `expectedIndex`, `expectedItemId` and `isFinalItem`. Exercise props accept an optional `onCompleted` callback. The completion contains the persisted Attempt ID, item ID, task type, optional score, and the updated session when applicable.

`onNext` is an optional standalone sequencing callback owned by the page. It is never used in session mode. The future runner owns Continue and summary navigation. The exercise does not navigate routes.

## Shared persistence

`persistExerciseOutcome` validates the supplied item/task and session context before any database write. It preserves the original Attempt and all outcome IDs/revisions. In session mode it copies the Attempt, adds `sessionId`, and delegates to `progressStudySession`, supplying the expected item/index. An injected clock is evaluated only for the final item to supply `finishedAt`.

The existing outcome repository remains the authority for the frozen queue, task linkage, optimistic concurrency, final completion and the atomic Attempt/Error/Review/session transaction. Standalone mode uses its existing outcome-only transaction. There is no Dexie migration (v3).

`ExercisePersistenceError` exposes a stable session error code and a safe message. `SESSION_PROGRESS_CONFLICT` explicitly asks the learner to resume before saving again. Raw database exceptions are not displayed or logged. Other persistence failures retain the current item for retry.

## Save and completion lifecycle

`useExercisePersistence` shares only saving, errors and saved identity. A synchronous ref gate prevents two events before the next React render from creating two outcomes. Persistence failure reopens the gate, emits no completion and advances no session. After a successful commit, the gate closes and the completion is emitted once, without a React effect. A callback exception cannot reopen the gate or turn a successful save into a retry; it produces only a fixed diagnostic message.

Session saves permanently disable recording reset, new recording, retranscription and persisted retries for the presented queue position. Standalone speech retry remains available. Feedback may remain visible after commit even though the database already points at the next item, or is completed after the final item. Refresh resumes from persisted state, not from old feedback.

Each exercise scopes its body by task/item/revision/session-position identity. Changing the supplied item or position remounts task state and runs existing microphone/recorder/transcription cleanup. Microphone access is enabled again for a new speech exercise; the browser's permission grant is unchanged. Source and response audio, status/alert regions and disabled/busy feedback remain available. Scoring, chunk analysis, audio segmentation and fluency algorithms are unchanged.

## Validation

- `tests/exercise-session-adapter.test.mjs`: copying/linkage, context validation, final clock, privacy-safe failures, conflict codes and completion shape.
- `tests/exercise-session-integration.test.mjs`: real WFD/RS/RA outcome factories with isolated fake-indexeddb, standalone saves, partial/final session saves, stale-save rejection, rollback and retry.
- `npm run test:exercise-session-browser`: isolated React StrictMode harness with actual Chrome IndexedDB, MediaRecorder and Web Audio; controlled HTTP STT response. All three task components cover failure/retry, synchronous double-click, one callback, post-save lock, final completion, item reset, dispatcher and standalone next behavior. Audit: `audits/session-07.04-browser.json`.

The harness is not a learner route and introduces no production UI. Controlled audio/transcripts do not establish human learner recognition quality. Native speech regression and package validation remain separate from the controlled adapter tests.

Validation run: 812 application/runtime tests and 7 package tests passed, alongside TypeScript/Vite build, lint and whitespace checks. The existing native `test:speech-browser` regression also passed RA/RS real Whisper, recording/analysis, runtime-down/restart, abort/stale-result rejection and zero remote requests. The existing `test:speech-migration` browser regression also passed all six controlled RA/RS cases, standalone transaction-failure retries, stale HTTP handling, WFD playback/save/Next reset, zero remote requests and zero browser-STT calls. Controlled pipeline evidence remains separate from the pending human speech benchmark.


A pre-existing runtime subprocess test now waits for health `ready` before posting audio. Previously it waited only for the listener to bind, racing asynchronous engine initialization and intermittently receiving the legitimate starting response under load. This is a test synchronization fix; production runtime behavior is unchanged.

## Deferred

Quick/Task/Mixed setup UI, session runner/Continue, exit confirmation and summary belong to later Activity 07 steps. Activity 05 human model, clean-machine, Windows/macOS and signing gates remain open.
