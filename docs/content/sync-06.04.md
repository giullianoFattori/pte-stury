# Activity 06.04 — Transactional installed content

The sync engine is implemented and tested, but **not activated in bootstrap**.
`bootstrapApp()` still runs the existing legacy seed. The 17 live WFD/RS/RA items
are not migrated. The generated catalog's three `*-900001` technical drafts cannot
appear in normal practice, even if explicitly installed with the new sync API.
Activation follows real-content migration in 06.08; no learner scoring changed.
Do not run the legacy upsert seed after adopting those same IDs into versioned
content: it could overwrite their metadata. Activation must replace that seed,
not run both flows together. The only generated IDs currently differ from live IDs.

## Persisted model and migration

Dexie version 3 adds only `contentState`, indexed by `key`. Existing v1/v2 stores,
rows and indexes remain intact; there is no data rewrite during the upgrade.
Versioned `StudyItem` rows add revision, authored status/source, canonical audio,
metadata and `catalogAvailable`. Legacy fields remain compatible, including
`createdAt` and `audioUrl`. A versioned audio path is copied to `audioUrl` solely
as the existing exercise adapter. Canonical comparisons ignore that alias.

Missing revision on an old row or Attempt means **unknown**. Upgrade never sets
it to 1, invents lifecycle/provenance or changes historical Attempts. Adoption of
an incoming item uses matching stable ID and task type; it replaces legacy content
with the canonical authored revision/content without claiming the old wording or
an old attempt used that revision. No historical revision archive is created.

Authored lifecycle (`draft`, `active`, `retired`) is independent of local catalog
membership (`catalogAvailable: true/false`). Omission from a newer catalog changes
only availability: the last fields, lifecycle, revision and timestamp remain intact.
Historical lookup through `getById()`/`getAll()` includes unavailable/retired/draft
rows. Normal task queries exclude them.

The immediately used `taskType`/`difficulty` indexes are retained. Boolean values
are not valid IndexedDB index keys, so `catalogAvailable` is not indexed. Current
practice filtering operates on the indexed task collection. Further query/index
design is 06.05; no broad metadata API is introduced here.

## Validation and deterministic planning

`verifyQuestionBankCatalog(unknown, unknown)` checks the exact bundle/manifest
shape, schema version, hash syntax, item semantics, duplicate identities and all
derived counts, including unique audio paths. Empty catalogs are rejected, matching
the ordinary 06.03 build policy. Audio existence/decode remains deferred.

The browser trusts application-owned generated assets whose exact bytes/hash are
verified by build parity and package inventory. It does **not** recompute SHA-256
or import Node crypto. These sanity checks cannot authenticate an attacker-supplied
bundle or prove its claimed hash. The API is internal, not an arbitrary import
endpoint. A compromised trusted frontend can bypass this boundary; package/source
integrity and a controlled app origin remain required.

The planner takes current rows, incoming items and an explicit installation time.
It is deterministic and does not mutate either input. Shared browser-safe canonical
semantics were extracted from 06.03; committed bundle/manifest bytes are unchanged.
Tags/skills are set-like, while task text, chunks, phrase groups and stress order
are semantic. Local timestamp/availability/audioUrl and object key order do not
participate in authored comparison.

| Situation | Planned result |
| --- | --- |
| New stable ID | Insert with incoming metadata and a new local createdAt |
| Same ID/task, legacy unknown revision | Adopt incoming content, preserve createdAt |
| Newer revision | Update canonical content, preserve createdAt |
| Same revision and semantic content | No item write |
| Same revision, different semantic content | Reject entire plan |
| Lower revision | Reject entire plan |
| ID changes task type | Reject entire plan |
| Missing previously installed versioned row | Mark unavailable; retain identity/content |
| Unavailable item reappears unchanged | Restore availability without a revision change |
| Incoming retired item | Preserve authored retirement exactly |
| Incoming draft | Install, exclude from practice |
| Invalid installed version metadata | Reject, do not guess a revision |

Plan categories are inserts, updates, unavailable, restored, unchanged and errors.
A plan with any error has no actionable mutation lists. Maps/sets avoid repeated
full scans inside loops. IDs absent from the incoming catalog are only managed if
already versioned/catalog-owned. Unknown-revision legacy seed rows remain outside
catalog omission handling during this transition; migration will adopt them later.

## Atomic persistence and same-version fast path

`syncQuestionBank()` validates incoming assets before entering one Dexie read-write
transaction over **only** `studyItems` and `contentState`. It reads state and plans
inside that transaction, preventing concurrent syncs from using stale row snapshots.
Equal installed schema/contentVersion returns unchanged without scanning items or
writing state. The installer trusts immutable application-owned contentVersion;
it does not detect a dishonest reused hash containing otherwise valid changed data.

Changed catalogs read current items once, apply bulk inserts/updates and then write:

```ts
{ key: 'question-bank', schemaVersion, contentVersion, installedAt }
```

The state is never committed if item writes fail. Likewise, a final state-write
failure rolls back preceding item writes. Attempts, Errors, Reviews, Sessions and
settings are excluded from the transaction and left untouched. No learner row is
created as a side effect of content installation. Rows omitted from a catalog are
never deleted. The current installed wording is the last canonical revision; exact
old wording/audio cannot always be reconstructed from historical itemRevision alone.

## Practice eligibility, startup and attempts

Versioned practice requires positive known revision/source, authored `active` and
`catalogAvailable === true`. Transitional unversioned practice accepts only the
explicit 17 grandfathered IDs, with no partial version metadata. Technical fixture
IDs are not grandfathered and all remain draft. `getByTaskType()` uses this rule;
historical queries retain access to every identity.

`syncGeneratedQuestionBank()` is an explicit installation API and can install the
technical drafts. `initializeQuestionBank()` is the future startup entrypoint:
it requires a catalog with active items, attempts transactional sync and on failure
checks for a usable previous bank. Versioned fallback rows must pass canonical item
validation; the grandfathered legacy fallback uses a readiness check for required
text/audio/chunks without inventing version metadata. A valid previous bank returns
a controlled `CONTENT_SYNC_FAILED` warning. A fresh/invalid/draft-only bank raises
`CONTENT_INITIALIZATION_FAILED`, suitable for a visible future startup error.
The existing database is never wiped. These entrypoints are not yet invoked by
bootstrap; warning/error presentation will be connected when content is activated.

WFD, RS and RA attempt builders now copy optional revision from the exact question
object passed by the exercise. They do no later database lookup. Legacy attempts
omit itemRevision, and later changes to the question cannot change a built Attempt.
No scores, error generation or review logic change. This is an MVP revision reference,
not a snapshot archive or official PTE content versioning.

## Tests and developer validation

`fake-indexeddb` 6.2.5 is a pinned **dev-only** dependency. Tests run real Dexie over
simulated IndexedDB to cover v2→v3 upgrade, transaction rollback, state writes,
unchanged learner history and practice filtering. They are not evidence of physical
browser/microphone or cross-platform package validation. Synthetic 1,000/5,000-item
catalogs run one transaction and a no-scan repeat install; fixtures never enter the
production bank. Timing/browser-startup measurements remain 06.08.

```bash
npm run content:build
npm run content:verify
npm test
npm run build
npm run lint
npm run package:test
git diff --check
```

Deferred: bootstrap activation, migration of the 17 questions, revision archives,
broad metadata queries, audio integrity/decode, import/ID allocation and new tasks.
Activity 05 human model, clean-machine and other-platform release gates are unchanged.

## Validation evidence — 2026-10-11 (Australia/Sydney)

All 468 app/runtime tests passed, including 23 sync scenarios, the v2→v3 database
upgrade and three presented-revision attempt cases. Five package tests passed.
The 60 content build/sync/upgrade tests also passed with the packaged Node 24.21.0
LTS baseline. Content build/verification, frontend build, lint and whitespace checks
passed. The generated content version remains unchanged:
`sha256:69780bb9094ecc13f70d107c35037b9396c77851f35b06c1c1e01a21e7c8fbf5`.

Fresh installs, no-scan/no-write same-version launches, revision conflicts,
availability/reappearance, draft exclusion, explicit retirement, legacy adoption,
rollback after bulk writes and rollback after state-write failure were exercised.
Tests seeded Attempts/Errors/Reviews/Sessions and verified identical rows afterward.
Synthetic 1,000/5,000-item syncs used one transaction each, followed by a no-op repeat.
These are deterministic automated tests using simulated IndexedDB, not an actual
browser migration or a new Activity 05 package/clean-machine certification.
