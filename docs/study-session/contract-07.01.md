# Activity 07.01 — Session contract and lifecycle

Status: **COMPLETE** for domain contract/lifecycle only. Activity 07 remains in
progress; selection, persistence orchestration, exercise adapters, navigation and
summaries are later steps. There is no session UI or learner-flow change here.

## Types and compatibility

The canonical `StudySession` is defined in
`src/domain/study-session/types.ts` and re-exported through the existing PTE types
entrypoint. Required fields are id, mode, status, startedAt, taskTypes, itemIds,
currentIndex, attemptIds and config. Modes are quick/task/mixed; statuses are
active/completed/abandoned. Optional fields are finishedAt and contentVersion.

`LegacyStudySession` explicitly represents old rows containing only id,
startedAt, optional finishedAt, taskTypes and attemptIds. `StoredStudySession` is
the union used by the existing Dexie table and CRUD repository. No stored row is
rewritten, no queue/status is inferred, and no migration/version bump is needed:
Dexie remains v3 with the same indexes. The repository's behavior is unchanged.

`parseStoredStudySession(unknown)` validates/copies a stored shape and returns the
explicit union. Historical rows retain original time strings, array order and
possible duplicate old attempt references rather than applying new invariants
retroactively. Legacy arrays have a defensive 10,000-entry read bound. Historical
sessions are not resumable: `parseStudySession` and lifecycle operations report
`LEGACY_SESSION_NOT_RESUMABLE`. Later persistence readers must parse dynamic rows;
`isVersionedStudySession` only differentiates an already-typed/validated union.
The presence of any new session field selects strict new-state validation; a
half-upgraded row cannot fall back to legacy interpretation.

## Config and frozen queue

`StudySessionConfig` requires a positive safe-integer itemCount (1–500) and may
include nonempty, unique difficulty/task filters. Difficulty accepts exact
integers 1–5. Task values are only the three implemented PTE task types. The count
bound is an application resource limit aligned with today's query limit, not an
official PTE limit. Default five-question Quick Practice and balanced mixed
selection are **not implemented** in this step.

The constructor requires the allowed taskTypes explicitly. Task Practice allows
exactly one; Mixed Practice requires at least two; Quick Practice allows one or
more available tasks. If config.taskTypes is supplied, its membership must equal
session.taskTypes (order need not match). Every queue identity must have a known
permanent content ID/prefix and belong to an allowed task. ID syntax reuses the
Activity 06 policy, including the explicit 17 grandfathered IDs. Syntax alone does
not prove practice eligibility, asset availability or difficulty membership;
07.02 must select through the content query layer. This domain layer does not
fetch content or infer question metadata.

The queue is nonempty, unique and exactly config.itemCount long. Some allowed
selection tasks may have zero slots when the requested mixed count is smaller
than the task set. Authored/input ordering is preserved; no sorting, reshuffling
or normalization occurs. Parser/operations copy and freeze the result, config
and arrays without mutating input. Only IDs are frozen, not historical wording or
audio snapshots. A later catalog update must not rebuild the queue.

## Position and lifecycle

`currentIndex` is the next unanswered queue position. `attemptIds` is ordered one
per answered position, so its length equals currentIndex and its values are
unique. The index is a safe integer from zero through queue length inclusive.

| State | Position | finishedAt |
| --- | --- | --- |
| Newly created active | 0, no attempts | absent |
| Active with remaining items | 0 … N−1 | absent |
| Active, ready to finalize | N, exactly N attempts | absent |
| Completed | N, exactly N attempts | required |
| Abandoned | 0 … N, preserves existing attempts | required |

The exhausted active boundary is deliberate: the final attempt is recorded before
explicit completion, with no hidden clock. Future persistence should commit final
progress and completion together where possible. Recovery of an exhausted active
session must finalize it rather than rerun the last item or read `itemIds[N]`.
Browser close/crash is not an abandonment operation.

Allowed transitions are create→active, active→completed, active→abandoned. Terminal
states cannot reopen or accept another attempt. All new timestamps must be valid,
canonical UTC ISO strings with milliseconds, and finish cannot precede start.
IDs and timestamps come from the caller: no random IDs, current clock, storage,
network, scoring or navigation inside domain operations.

Pure API:

```ts
createStudySession(input): StudySession
recordSessionAttempt(session, link, expectedCurrentIndex): StudySession
completeStudySession(session, finishedAt): StudySession
abandonStudySession(session, finishedAt): StudySession
```

Recording validates the expected index, current item, task, session linkage and
unique attempt ID. It advances exactly once and does not automatically complete
or save anything. The link is a small descriptor `{ id, itemId, taskType,
sessionId }`, projected from the outcome; it is not the entire scoring Attempt.
Invalid input yields a structured error with a stable code and field path.

## Attempt linkage and catalog identity

`Attempt.sessionId?: string` is adopted. It stays absent for old and standalone
attempts; no history backfill or attempt-builder modification occurs in 07.01.
Session progress requires a matching non-optional link.sessionId. The future
adapter/persistence layer will assign/verify it when storing a session outcome.

`contentVersion` is an optional `sha256:<64 lowercase hex>` creation-time catalog
identity. Absence means unknown and is never synthesized. Normal application
builders should supply the installed catalog hash. All operations preserve it;
resume must not replace it with the latest catalog version. Actual presented
content revision still belongs on the Attempt, as implemented in Activity 06.
This is provenance, not an archive of historical content.

## Errors and deferred persistence guarantees

`StudySessionError` has code plus immutable issues `{ path, code, message }`.
Messages are controlled text and do not echo raw input/storage exceptions.
Implemented lifecycle errors include INVALID_SESSION_CONFIG,
INVALID_SESSION_STATE, SESSION_PROGRESS_CONFLICT, SESSION_ATTEMPT_MISMATCH,
SESSION_NOT_ACTIVE, SESSION_ALREADY_COMPLETED and LEGACY_SESSION_NOT_RESUMABLE.
INSUFFICIENT_CONTENT, SESSION_NOT_FOUND and SESSION_ITEM_UNAVAILABLE are reserved
for selection/resume implementations; this step does not pretend to implement
those workflows.

Expected-state checks protect a domain operation **only if** the future repository
re-reads the persisted row inside a write transaction. 07.03 must atomically save
Attempt/Errors/Reviews and session progress, preserve the current position on any
failure, and enforce one active session across tabs. Pure creation cannot enforce
a global one-active-session policy. No automatic abandon, retry, queue skipping,
adaptive ranking, mastery or gamification is introduced.

## Verification

44 focused tests cover vocabularies, all modes, config types/bounds, ID/prefix and
queue integrity, timestamps, catalog identity, immutable input/results, ordered
progress, stale-index/duplicate/wrong-link errors, exhausted completion, partial
abandonment, terminal transitions, historical rows and partial-new rejection.
A virtual TypeScript consumer verifies readonly fields, explicit legacy separation
and optional string-valued Attempt linkage.

```bash
npm test              # 700 PASS, including application/runtime regressions
npm run build         # PASS; existing >500 kB Vite chunk advisory remains
npm run lint          # PASS
npm run package:test  # 7 PASS
git diff --check      # PASS
```

No dependency change, Dexie version/index change, content rebuild/migration,
scoring change, runtime change or exercise UI change was required. Next: **07.02
Session Builder + Selection Rules**, using the validated content query layer and
injected RNG to construct the frozen queue.
