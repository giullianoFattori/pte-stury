# 07.08 — Session runner and navigation

## Presentation and the Study hub

The shared runner now has separate `SessionHeader`, `SessionNavigation`, `EndSessionConfirmation` and `SessionTerminalState` components. Quick/Task/Mixed labels come from saved mode/config; Task includes the configured task's human label. Numeric progress belongs to the presented item. It stays at the old position while saved feedback is visible; Continue/reload reads persisted progress before updating it. The exercise no longer renders a duplicate session progress line. Standalone progress is unchanged.

Study has one `ActiveSessionCard` above the three configuration cards. It shows mode/task, position and the single **Resume current session** CTA. Resume opens that saved identity and never creates a queue. All new starts are disabled while any versioned session is active. One shared discovery status/error/retry serves all modes. Discovery failure leaves starts disabled until a successful retry; clearing a start error cannot bypass that gate.

## Navigation policy

**Back to Study and browser navigation do not abandon.** Unfinished sessions remain active and resumable. Browser close/reload follows the same persistence semantics. The navigation text explicitly explains that unsaved answers/recordings are discarded.

This step intentionally introduces no generic dirty flag, global navigation blocker or `beforeunload` warning. A warning based only on “active session” would incorrectly block ordinary resumable navigation. Reliable task-specific dirty tracking can be added later; current behavior is simple and explicit. End confirmation is a separate destructive-action confirmation, not a route-leave trap.

## End session

End opens an accessible native modal dialog. Initial focus is **Keep studying**; Tab remains within the modal, Cancel/Escape preserve current local exercise work and restore focus to the invoking control. The dialog explains saved-history retention, non-resumability and unsaved-work loss. During confirmation persistence, buttons and Escape cancellation are disabled and the action says **Ending…**. A synchronous gate prevents duplicate confirm events.

`endStudySession` reads the latest parsed persisted session at confirmation time and delegates to the existing application `abandonActiveSession(id, latest.currentIndex, finishedAt)` helper/repository. The UI supplies the ISO clock. It never uses the displayed index, which may lag after a successful save.

Only a successful abandoned write navigates to Study. The route then unmounts the exercise and runs existing microphone/recorder/transcription cleanup. Attempts, ErrorRecords and ReviewItems remain unchanged; the session retains its IDs/progress, becomes `abandoned` and receives `finishedAt`. Study no longer shows Resume and a new Quick/Task/Mixed session may start.

The confirmation read is not an excuse to retry a conflicting write: if another tab changes progress between read and transaction, the operation returns a reloaded active/completed/abandoned view and displays a change notice. There is no automatic abandon retry or false success redirect. Already completed/abandoned rows are displayed as terminal states without another write/clock. Generic failures leave the dialog recoverable with a safe retry message; raw storage exceptions are not shown.

## Terminal and error states

Completed labels remain **Quick Practice complete**, **Task Practice complete**, and **Mixed Practice complete**, with completed count and Back to Study. Abandoned routes show **This study session has ended** and saved-history guidance. Neither terminal state offers Continue. Missing, corrupt and historical legacy rows have authored safe messages.

Existing save conflicts retain **This session changed in another tab** and Reload session. Reload may now resolve an abandoned state as well as active/completed. The feature loader also handles a terminal transition between its initial read and the resume transaction. Domain parsing, lifecycle and storage types remain unchanged.

## Validation

- `tests/study-session-navigation.test.mjs`: fresh persisted index after saved feedback, unsaved end, unchanged saved outcomes, ability to start again, progress/final-save races, already-terminal no-op, abandonment during resume, explicit retry and safe legacy/corrupt/not-found states/mode labels.
- `npm run test:session-navigation-browser`: actual application routes, StrictMode, IndexedDB, MediaRecorder and Web Audio in Linux Chrome; controlled STT HTTP. Covers mode headers and coherent feedback progress, Back/browser Back and Resume, shared active card/discovery/error retry, Cancel/Escape focus and local draft preservation, write failure/retry, duplicate-confirm guard, End after saved feedback, history retention, new sessions, ended routes, RA recording cleanup on leave, RS/Mixed cleanup on End, a real two-tab stale-abandon race and final completion race. Audit: `audits/session-07.08-browser.json`.
- Existing Quick, Task, Mixed and exercise-session Chrome suites are rerun. Standalone task scoring/behavior remains covered by their existing factories, unit suites and browser regressions.

No Dexie schema/index changes (v3), scoring, speech-model/runtime or allocation changes. No summary metrics, mastery or review/error features. Controlled browser speech does not establish physical microphone support, human recognition quality or packaged-platform certification. Those gates remain separate; full completion results belong to 07.09.

Validation result: **886 application/runtime tests PASS**, **7 package tests PASS**, TypeScript/Vite build PASS, lint PASS and `git diff --check` PASS. All five Chrome suites passed with zero page errors and zero unexpected remote requests.
