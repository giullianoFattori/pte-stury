# Activity 07.03 — Durable sessions and resume/recovery

Status: **COMPLETE** within persistence/application infrastructure. Activity 07
remains in progress. No session UI, exercise adapter, summary, scoring change,
adaptive selection, review UI or automatic navigation is introduced.

## Creation and one active session

`startStudySession(request, deps)` validates/snapshots the request, checks for an
existing active versioned session, invokes 07.02 preparation and calls
`createActive()`. Legacy historical rows do not block creation. A current active
session yields `ACTIVE_SESSION_EXISTS`; it is never silently abandoned.

The repository rechecks inside one read/write transaction spanning studySessions,
studyItems and contentState. IndexedDB serializes overlapping write transactions
across database connections/tabs, so two callers that passed the initial check
cannot both create active rows. Identity collisions do not overwrite old rows.
Only a fresh active queue (index zero/no attempts) can be inserted.

Creation also checks the installed content version, current eligibility/difficulty
and structural validity of every prepared item. A catalog change during preparation
requires a new preparation (`SESSION_PROGRESS_CONFLICT`), rather than silently
changing the queue or installing stale unavailable content. No catalog state yields
a controlled storage error. The current canonical bootstrap supplies this state.

The existing generic blind session `create/update` API is replaced with validated
`createActive`, parsed `getById/getAll`, `getActiveVersioned`, `resumeActive`,
`abandonActiveSession` and exhausted-session recovery `completeActiveSession`.
There is intentionally no separate progress-only write API: advancement belongs
to the outcome transaction.

## Parsing and historical compatibility

Every returned session row passes the 07.01 stored-row parser. Malformed stored
state becomes `SESSION_STORAGE_CORRUPT`, not a raw Dexie exception or a fabricated
queue. Legacy rows remain readable historical records, unchanged and
non-resumable (`LEGACY_SESSION_NOT_RESUMABLE`). The active lookup parses all rows;
more than one active versioned row yields `MULTIPLE_ACTIVE_SESSIONS`, never an
arbitrary choice. Malformed history is not automatically repaired/deleted.

Dexie remains **v3** with the same tables/indexes. Added fields are non-indexed;
no migration, status cache or speculative index is needed for the small expected
session volume. Learner history/settings/content records are not rewritten by
session operations.

## Resume and current item

```ts
resumeStudySession(sessionId, sessions?)
findResumableStudySession(sessions?)
```

These are reusable application facades with no navigation side effects. Resume
reads session, attempts, question and content state in one read transaction.
It requires an active versioned row and uses the authoritative frozen
`itemIds[currentIndex]`, through historical-capable ID lookup, not practice
selection. Previously saved attempt references must exist and match the session,
ordered queue item and task; broken progress references are storage corruption.

Normal result:

```ts
{
  kind: 'item',
  session,
  item,
  isCatalogCurrent,
}
```

A different/unknown current catalog identity only makes isCatalogCurrent false.
It does not rebuild/reorder the queue or replace its original contentVersion.
Retired/unavailable published items remain usable when their historical row is
structurally sound. Canonical structure is checked against published requirements;
legacy questions use the established legacy readiness policy. Returned audioUrl
may be derived from canonical audio.path without a database rewrite. Conflicting
identity/audio alias is `SESSION_ITEM_MISMATCH`; absent/incomplete content is
`SESSION_ITEM_UNAVAILABLE`. Nothing is silently skipped. Structural resolution
is not a new audio-byte/decode check; asset integrity remains the content/package
pipeline responsibility.

An older valid exhausted-but-active row returns:

```ts
{ kind: 'completion-pending', session, isCatalogCurrent }
```

No nonexistent item or repeated last question is returned. Explicit
`completeActiveSession(id, expectedIndex, finishedAt)` verifies saved attempt
references and calls the domain completion operation transactionally. A row with
missing/unlinked attempts cannot be "recovered" by inventing outcomes. New final
outcomes do not leave exhausted active state.

## Atomic outcomes and optimistic concurrency

WFD, RS and RA already share `studyOutcomeRepository.createStudyOutcome`. The
same implementation now accepts optional sessionProgress; scorer functions and
outcome factories are unchanged. `createStudyOutcomeRepository(database)` permits
isolated integration tests; the production singleton remains the same entrypoint.

```ts
{
  attempt, errors, reviews,
  sessionProgress: {
    sessionId,
    expectedIndex,
    expectedItemId,
    finishedAt, // required only on the final item; caller supplies UTC timestamp
  },
}
```

A session attempt must already carry `attempt.sessionId`; the writer does not
patch linkage afterwards. A linked attempt without sessionProgress is rejected.
Standalone saves keep their original three-table path and result shape and need
no sessionId. Session outcomes add the saved session to the returned result.

The session-mode transaction spans attempts, errors, reviews, studySessions and
studyItems:

1. Detect ambiguous multiple-active state; reload/parse the persisted session.
2. Check expected index/item and active status. A stale final-item writer gets a
   progress conflict after the winner advanced/completed; no outcome is inserted.
3. Resolve the historical current item and verify previous progress references.
4. Verify attempt/session/item/task linkage and globally unused attempt ID.
5. Verify ErrorRecord/ReviewItem linkage to that same outcome, including optional
   review sourceErrorId membership.
6. Compute the next state using `recordSessionAttempt()`. On the last position,
   require the injected finish timestamp and call `completeStudySession()`.
7. Save Attempt, ErrorRecords, ReviewItems and the new session in that same
   transaction; return only after commit.

Any error aborts all writes. Missing final timestamp, wrong linkage, stale state,
constraint/storage failures or a failed session update cannot leave an outcome
without progress or progress without its outcome. Terminal sessions cannot accept
progress. The exact presented itemRevision remains on the Attempt; the writer
does not replace it with a later catalog revision. Session summary/aggregates are
not stored here.

`progressStudySession(input, outcomes?)` exposes this shared save path. It performs
no scoring or navigation. Real adapters that supply session linkage and react to
successful persistence remain 07.04.

## Abandonment and errors

`abandonActiveSession(id, expectedIndex, finishedAt, sessions?)` loads current state
inside a write transaction, requires active status and the expected position,
then calls the domain abandonment operation. The expected index is mandatory in
this MVP API so stale callers cannot discard newly advanced progress. Session and
partial outcomes remain stored. Completed/abandoned rows do not block a new start;
browser close/crash never triggers implicit abandonment.

Controlled errors include ACTIVE_SESSION_EXISTS, MULTIPLE_ACTIVE_SESSIONS,
SESSION_STORAGE_CORRUPT, SESSION_NOT_FOUND, SESSION_NOT_ACTIVE,
LEGACY_SESSION_NOT_RESUMABLE, SESSION_ITEM_UNAVAILABLE, SESSION_ITEM_MISMATCH,
SESSION_PROGRESS_CONFLICT, SESSION_ATTEMPT_MISMATCH and SESSION_PERSISTENCE_FAILED.
Domain validation errors retain their structured codes. Raw database exceptions
are mapped to a fixed safe persistence message, not displayed as raw internals.

## Evidence

35 persistence/resume/concurrency integration tests use isolated fake-indexeddb
and real Dexie/repositories/application services. They cover creation, legacy
history, active conflicts, catalog/availability races, reopening the database,
retired/missing/corrupt questions, malformed/multiple-active sessions, exhaustive
recovery, duplicate/linkage failures, all three task types, standalone saves,
terminal/abandon behavior and new starts after terminal state.

Two separate database connections test simultaneous starts, simultaneous progress
at one position and the final-item race. Exactly one writer succeeds. Injected
failures at Attempt/Error/Review/session writes compare the entire database snapshot
before/after and confirm rollback; creation failure similarly preserves history.

Actual Linux Chrome 154.0.8037.97, two tabs and a temporary disk-backed profile
also passed: simultaneous creation, partial/final outcome races, complete browser
process restart, exact frozen queue/currentIndex, retired/unavailable item resume
and catalog mismatch. Final counts were one completed session, two attempts,
two errors and two reviews, with zero page/console errors. Audit:
[audits/session-07.03-browser.json](../../audits/session-07.03-browser.json).
The source-module harness is isolated from the SPA, uses synthetic outcomes and
is deleted after the run. It is not session UI, physical microphone, packaged
workflow or cross-platform certification; those remain later validation gates.
No private learner data/audio/transcript was used or archived.

```bash
npm test                          # 790 PASS
npm run build                     # PASS; existing Vite chunk advisory remains
npm run lint                      # PASS
npm run package:test              # 7 PASS
git diff --check                  # PASS
npm run test:session-persistence-browser
```

The manual browser command needs developer-only Playwright (optionally set
PLAYWRIGHT_MODULE to its installed entrypoint) and /usr/bin/google-chrome. It runs
an isolated http://127.0.0.1:5177 harness, not the production
http://127.0.0.1:8765 product.
No new production dependency is added. Next: **07.04 — Shared Exercise Session
Adapter**, retaining standalone task routes and existing scoring.
