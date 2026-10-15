# 07.06 — Task Practice

## Study workflow

Study now contains Quick Practice, Task Practice and the existing Standalone Practice links. Task Practice uses native radio groups for exactly one task (canonical WFD/RS/RA order), question count (3, 5, Max) and optional difficulty (Any, 1, 2, 3). No difficulty labels or multi-task configuration are introduced.

Availability comes from `studyItemsRepository.countPracticeItems` using the selected task and optional single difficulty. Any omits the difficulty filter. React never loads the entire bank to calculate counts. Pending counts cannot enable Start or display a previous filter's capacity; late responses are discarded after filter changes/unmount/StrictMode cleanup.

The default count prefers 5 if available, otherwise the current maximum. Impossible presets are disabled. Max resolves to an explicit positive integer before calling the domain layer. Zero capacity displays “No questions available for this filter” and disables Start. The existing domain maximum is 500: if a future filtered pool exceeds that, Max is disabled with an explanation; it is never silently capped. The 3/5 presets remain available.

Changing task/difficulty resets the UI default and reloads capacity. If the bank shrinks after discovery, the domain returns `INSUFFICIENT_CONTENT`; availability is refreshed and the failed count is cleared. The learner must choose again. A requested queue is never silently shortened or filled from another task.

## Shared creation and active session state

`startTaskPractice({ taskType, itemCount, difficulty? })` strictly maps configuration to the existing `startStudySession` Task request. Unknown fields and malformed config fail through the existing validator. Sampling, eligibility, uniqueness, capacity and frozen queues remain owned by 07.02; persistence and concurrent-start checks remain owned by 07.03.

Quick/Task share `sessionStartDependencies.ts`: installed `contentState` version, repositories, UUID, ISO clock and outer RNG. `startPracticeSession` performs shared active-session discovery and resolves creation races to Resume. It never replaces or abandons an active Quick/Task session.

`useActiveStudySession` is called once by the Study page. Both cards use its active session, loading/error state and synchronous start gate. The single Resume CTA opens the existing identity; Task controls are disabled while an active session exists. A stale page discovering another tab's session during Start stays on Study and presents Resume. Errors use authored messages, not raw database exceptions.

## Runner and compatibility

New Task sessions use the same `/study/session/:sessionId`, `StudyItemExercise` and atomic outcome/progress adapter as Quick. Task completion now says **Task Practice complete**, with the existing question count and Back to Study. Feedback/Continue, refresh before/after save, resume and conflict reload are unchanged. There is no full metrics summary.

No speech preflight is performed. RS/RA can start with the runtime unavailable; their existing exercise UI handles readiness. No scoring, speech, content, database, index or learner-history algorithms changed. Dexie stays v3. Standalone routes remain available.

## Validation

- `tests/task-practice.test.mjs`: WFD 3/5, insufficient WFD 6, RS/RA 6, difficulty capacity/selection parity, Any, zero capacity, Max/default count policy and 500-item bound, malformed config, installed identity, no silent shrink, existing Quick/Task resume and concurrent Quick/Task creation.
- `npm run test:task-practice-browser`: actual app routes, StrictMode and IndexedDB in Linux host Chrome. Completes a three-item WFD session, verifies queue purity, preset/default revalidation, difficulty 1/2/3 counts, zero state, a real catalog-capacity change, filtered Max=2 completion, refresh before/after save, Back/Resume, completed-route reload, RS Max=6 creation without speech preflight and stale-tab Resume. Audit: `audits/session-07.06-browser.json`.
- `npm run test:quick-practice-browser`: existing full five-item Quick flow, refresh/Continue, creation races and two-tab conflict reload.
- `npm run test:exercise-session-browser`: all WFD/RS/RA reusable exercises, including standalone saves/Next, controlled speech, atomic progress and duplicate-save guards.

Browser scripts use an independently installed Playwright via `PLAYWRIGHT_MODULE`. The Task suite requires no microphone or STT; RS coverage proves creation/routing only. Other browser suites use controlled speech HTTP. This is not physical-microphone, human model quality, clean-machine or packaged-platform certification; those gates remain separate.

Mixed configuration, explicit abandon UX, full summary, adaptive ranking, mastery and review/error features remain deferred.

Validation result: **848 application/runtime tests PASS**, **7 package tests PASS**, TypeScript/Vite build PASS, lint PASS and `git diff --check` PASS. Task, Quick and reusable-exercise Chrome suites passed with no page errors or unexpected remote requests. The Task suite recorded zero speech preflight requests.
