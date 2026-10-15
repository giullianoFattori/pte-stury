# 07.05 — Quick Practice

## Learner flow

`/study` now offers **Start Quick Practice** above the existing standalone task links. There are no configuration controls. Creation is a button action, never a mount effect: it reuses the domain Quick contract (five unique questions, all available implemented tasks, unrestricted difficulty, balanced allocation).

The UI boundary reads the installed `contentState` version and supplies `crypto.randomUUID`, the current ISO time and `Math.random` to the existing session service. Domain selection remains deterministic with injected dependencies in tests.

Study checks `findResumableStudySession` on mount. An active versioned session of any mode produces **Resume current session** and its question count. No session is silently abandoned. A stale Start click rechecks storage; if another tab wins creation, the UI presents Resume rather than creating another queue. Resume opens the saved identity, even if another tab completed it since discovery. Double-clicks are guarded synchronously and buttons are disabled while pending.

## Session route and persistence

`/study/session/:sessionId` is shared infrastructure for later modes. The route loads the saved session and resumes through `resumeStudySession`; it never builds or reshuffles a queue. Current item/index, total and final-item flag come from persisted state and are passed to `StudyItemExercise`. Existing WFD/RS/RA scoring, recording, source audio and save factories are unchanged.

Saving uses the 07.03 atomic outcome/progress transaction. Feedback stays visible at the presented position. **Continue** re-reads storage before showing the next item or completion. A refresh before save restores the same question; a refresh after save, before Continue, opens the next unanswered question. The final save completes storage immediately, with feedback shown until Continue. Completed routes show a lightweight completion message and Back to Study, including on direct navigation or refresh. There is no aggregate/official PTE score or full summary.

An older verified exhausted-active representation is conservatively completed through the existing repository recovery operation with an outer clock. A concurrent finish between read and resume is resolved by re-reading completed state. Abandoned or legacy historical sessions remain non-resumable.

Back links and browser Back preserve active sessions. There is no abandon action in this step. Speech runtime availability is handled by the existing exercise controls and cannot prevent session creation or cause automatic progression.

## Conflicts and lifecycle

Exercise props now optionally report controlled persistence errors to the runner. On `SESSION_PROGRESS_CONFLICT` (or a terminal-state race), the runner removes the stale exercise and Continue, shows **This session changed in another tab**, and offers **Reload session**. It never automatically retries stale outcomes. Other save failures remain in the exercise with its existing retry controls.

Route load failures use bounded authored messages, not raw IndexedDB exceptions. Missing items and malformed state fail visibly without deleting learner data. Loading and failure states use status/alert roles; controls are actual buttons and expose busy/disabled state. Async discovery/resume results are ignored after cleanup, including StrictMode's effect replay and route changes. Item identity still scopes exercise state and native/recording cleanup.

There are no database/index changes: Dexie stays v3. No Task/Mixed configuration, explicit abandon UX, adaptive selection, reviews, mastery or summary screen is introduced.

## Validation

- `tests/quick-practice.test.mjs`: fixed semantics, installed content identity, one-active creation race, existing modes, insufficiency, frozen-queue reload, catalog changes, safe missing/malformed/legacy/abandoned errors, terminal race, and exhausted-active recovery.
- `npm run test:quick-practice-browser`: real application routes and StrictMode in Linux host Chrome, actual IndexedDB/MediaRecorder/Web Audio, controlled STT HTTP. Completes all five questions, checks feedback/Continue, refresh at index 2 and after its save, browser Back/Resume, completion reload, stale Study creation, and a real two-tab save conflict with no duplicate outcome. Audit: `audits/session-07.05-browser.json`.
- `npm run test:exercise-session-browser`: regression for all three reusable exercises in standalone and session modes, including save retry, duplicate guard, callback and standalone Next behavior.

Optional browser suites use an independently installed Playwright (`PLAYWRIGHT_MODULE` may point at its entry module); no new application dependency is needed. Example: `npm run test:quick-practice-browser`.

Controlled speech validates orchestration, not physical microphone support or human learner model quality. Package tests cover the existing package/static contract; actual packaged session certification belongs to 07.10. Activity 05 platform/signing/clean-machine/human benchmark gates remain separate.

Validation result: **821 application/runtime tests PASS**, **7 package tests PASS**, TypeScript/Vite build PASS, lint PASS, `git diff --check` PASS. Both Chrome suites above passed with zero page errors and zero remote requests. No scoring/domain persistence algorithms were modified.
