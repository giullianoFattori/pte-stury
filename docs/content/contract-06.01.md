# Activity 06.01 — Content contract and versioning

Status: contract defined. The canonical types/constants live in [domain/content/types.ts](../../src/domain/content/types.ts). This step defines the authoring boundary; the existing arrays, StudyItem rows, seed, exercise UI, scoring and database schema continue to operate as before. Runtime JSON validation begins in 06.02, deterministic builds in 06.03, persistence migration/sync in 06.04 and existing-content migration in 06.08. TypeScript types alone do not validate imported JSON.

[06.02 runtime validation](validation-06.02.md) is now implemented. Its v1 activation rules require nonempty skills on active/retired content and positive safe-integer audio milliseconds; draft skills remain optional/possibly empty and estimatedSeconds accepts positive finite decimals. These refinements are enforced by the parser, while legacy production content remains untouched.

## Authored content and persisted data

`QuestionBankItem` defines application-owned content: id, taskType, difficulty, prompt, optional answer/transcript/audio/chunks/phraseGroups/stressWords, plus required revision/status/source and optional tags/skills/topic/estimatedSeconds. Fields are at the top level, matching the planned JSON format. Metadata is reusable as `StudyItemMetadata`. The task enum remains exactly WFD, RS and RA; future task prefixes are examples, not registered task types.

`QuestionBankItem` is separate from the existing persisted `StudyItem`. Authored content has no `createdAt`; timestamps of authoring/importing/installing are not interchangeable and must not cause nondeterministic content builds. Existing `createdAt` values remain intact. Canonical audio is an `AudioAsset` object; the legacy `audioUrl` field is unchanged in StudyItem. A later validated adapter/sync will resolve that compatibility boundary, preserve original IDs/timestamps, and persist versioned metadata. No adapter or automatic legacy defaults are installed in 06.01.

AudioAsset has path, optional sha256/durationMs/mimeType. Path means a root-relative application-owned asset such as `/audio/rs/rs-001.mp3`, never a remote URL, traversal or user-supplied filesystem path. SHA-256 is lowercase 64 hexadecimal characters; durationMs is a positive finite number, MIME matches the decoded format. Required files/decode/integrity checks arrive in 06.02/06.06. Optional integrity fields do not mean an unverified artifact is safe to ship: package inventory must attest all shipped content/audio independently.

The shared type keeps answer/transcript/audio optional to represent unfinished drafts. Activation requires task-specific validation: RS and RA answer equals transcript; WFD/RS active audio must exist; difficulty is an integer 1–5; revision is a positive integer. Chunks and RA phrase/stress helpers retain their current meaning. 06.02 will reject invalid content instead of silently correcting it. No malformed/draft record enters practice merely because it has been type-cast.

Optional metadata uses only the existing Skill union. Tags are distinct nonempty author-supplied strings; their ordering is presentation-only and must not change query semantics. Topic is a nonempty string; estimatedSeconds is a positive finite number. Do not silently lowercase, spell-correct or infer metadata on import; any future normalization is explicit and deterministic.

## Permanent identity

New IDs use the task prefix plus exactly six decimal digits: `wfd-000001`, `rs-000001`, `ra-000001`. The numeric suffix starts at 1; zero is reserved and not a valid allocation. The prefix registry includes only implemented tasks and cannot infer new exercise support.

If the six-digit space is exhausted, allocation fails until an explicit new ID policy is adopted; it never wraps or recycles an existing identity.

Existing IDs are grandfathered **exactly as published**: `wfd-001`…`wfd-005`, `rs-001`…`rs-006`, `ra-001`…`ra-006`. They will not be padded, renumbered or aliased. These 17 identities remain valid permanently, including after retirement. New authoring must not allocate more three-digit IDs. A future validator uses the explicit legacy identity set rather than accepting every short prefix-shaped string. Historical links continue using the original string, without guessing that `ra-001` means `ra-000001`.

An allocated ID is permanent and never recycled, even when its draft is rejected or its item is retired. Allocation must consult a durable registry of every allocated ID, not only active rows or the largest current filename; implement that in the later authoring tool. Reserving an ID must be atomic when concurrent authors/imports are supported. Filenames, sorting, whitespace and moving a file do not change identity. Duplicate IDs are errors even across lifecycle states/batches. Changing taskType is a new identity; retire the old item rather than changing the meaning of its prefix.

Retirement preserves resolution for Attempts, ErrorRecords, ReviewItems and StudySessions. Removing a source file is not permission to delete historical identity or learner rows. Missing previously installed active IDs will be retired by the 06.04 sync policy, retaining their last content. Publishing a complete catalog must retain retired records/identity registry; absence cannot distinguish accidental omission from intentional historical erasure.

## Per-item revision

Revision is a positive integer starting at 1, scoped to an immutable ID. Advance it once for a published semantic update, regardless of how many fields changed. It never decreases or resets after retirement/reactivation. Published `(id, revision)` denotes immutable content; equal revision with different semantics is an integrity error, not a permitted silent replacement. Authoring edits can be grouped before a revision is published.

Increment for prompt, answer, transcript, chunks, phraseGroups/stressWords, audio path/identity/bytes, difficulty, lifecycle, provenance/source, skill/topic/tag membership or estimated duration changes. These affect task behavior, eligibility, selection, learner interpretation or provenance. Replacing audio at the same path still requires a revision and refreshed asset identity. Generated content starts as draft and requires explicit human review before activation; activation itself advances a previously published draft revision. Source category never implies a review or a license.

Do not increment for JSON indentation/key order, file location, newline encoding, or ordering of a set-valued metadata list with unchanged membership. Changing case, punctuation, word spacing or ordering of chunks/phrase groups may change display/scoring/meaning and is task-relevant; do not dismiss it as formatting. Asset encoding changes alter its bytes/identity and require a revision even if perceived speech sounds equivalent.

## Lifecycle

| Status | Normal practice | Historical lookup | Publication policy |
| --- | --- | --- | --- |
| draft | Excluded | Identity remains reserved | Incomplete or awaiting review; generated/imported material defaults here |
| active | Eligible after validation | Resolves by stable ID | Required fields/assets validated and provenance/review accepted |
| retired | Excluded | Content retained/resolvable | Previously allocated identity preserved; never reused |

Permitted published transitions are draft→active after review, draft→retired when withdrawn, active→retired when withdrawn, and retired→active only after renewed validation/review with a newer revision. Editing an active item is prepared outside the installed catalog and then published atomically; do not downgrade an installed active identity to draft and erase its historical interpretation. Lifecycle is enforced by future validators/sync/queries, not by the current legacy seed or screens.

## Independent version layers

- `QUESTION_BANK_SCHEMA_VERSION = 1`: shape/semantics of the content format. An incompatible format change requires an explicit new version and migration/rejection path; never reuse version 1 for different semantics.
- Item revision: semantic version of one stable identity.
- Manifest contentVersion: `sha256:<64 lowercase hex>` of deterministic UTF-8 bundle bytes. Identical inputs/config/assets produce identical bytes/hash. It is not a timestamp, application version or manually edited sequence number.
- App/runtime/API versions and Dexie database version remain independent. Declaring content schema version 1 does not increment or reset the current Dexie schema (version 2).

The planned `QuestionBankBundle` contains schemaVersion and ordered items. `QuestionBankManifest` contains schemaVersion, contentVersion, total itemCount, countsByTaskType for every implemented task (zero included), and audioAssetCount of unique referenced paths across all lifecycle states. Counts are checked against the actual bundle. Draft/retired totals and active-only stats may be derived by 06.03; none is mislabeled as the practice count. No generated bundle, timestamped content manifest or build command is introduced now.

The content hash detects changes; it does not authorize decreasing revisions or modifying equal revisions. Even a formatting-only rebuild may change byte identity if canonicalization changes, but it must not fabricate item revision updates. Schema/config and canonicalization rules must be explicit in the later deterministic builder. Packaging owns the immutable bundle/assets and inventories exact bytes; IndexedDB user data is a separate ownership boundary.

## Attempt revision and future synchronization

Attempt now allows optional `itemRevision` as a contract field. Legacy Attempts omit it; missing means **unknown**, not revision 1. Existing attempt builders/save flows do not populate it in this step. When validated versioned items are installed in 06.04, saving an Attempt should capture the presented item revision, not a later lookup that might already have changed. Stable itemId remains the primary link; no backfill can infer which revision an old learner saw.

A revision reference is not an archived question snapshot. Exact historical wording/audio after edits requires retaining revisions or an immutable attempt content snapshot; evaluate that retention strategy in 06.04 before claiming old scores can be recomputed. Existing stored outcomes/errors/review prompts remain learner-owned evidence and must never be regenerated or deleted by content sync.

Planned atomic sync: new identity inserts; newer revision updates; same revision/same semantic content is a no-op; equal revision/different semantic content or revision rollback rejects the batch; missing prior active content retires while preserving last content/history. One Dexie transaction applies content and installed manifest state. Attempts, Errors, Reviews and Sessions are never deleted by content updates. Query/index implementation and old-DB upgrade testing belong to 06.04/06.05, not this contract-only step.

An explicit authored retirement advances its published revision. Absence from a later catalog instead causes local practice exclusion while preserving the last published revision and body. 06.04 must represent that derived catalog availability separately from immutable authored revision data; it must not invent an author revision or treat local exclusion as an equal-revision author edit. Reappearance of unchanged active authored content restores catalog availability; reactivation of an explicitly retired authored item requires a newer reviewed revision.

## Provenance and next gate

Source categories are internal, licensed, generated and imported. Every later batch must carry provenance evidence; licensed/imported content requires recorded permission/attribution, and generated content requires review. A source enum alone proves neither copyright permission nor quality. Do not import commercial question banks without permission.

06.01 completion: durable authored type, metadata/lifecycle/source, schema constant, permanent legacy/new ID rules, per-item and bundle version semantics, future audio/manifest shape and optional Attempt revision contract. Existing question files/IDs, scoring, seed, UI and Dexie schema are unchanged. Next: 06.02 JSON format and runtime validators; do not begin migration or bulk import before that gate.

## Validation

`tests/content-contract.test.mjs` checks the frozen vocabulary, all 17 unchanged legacy identities, and compiles a virtual TypeScript consumer with valid author/manifest/legacy/Attempt shapes and rejected missing metadata, unsupported lifecycle/source/task/schema, partial task counts, mutable content and legacy authoring aliases. It intentionally does not claim runtime JSON/ID/audio validation. `npm test`: 257 PASS; `npm run build`, `npm run lint` and `git diff --check`: PASS. No DB upgrade or generated content is introduced in this step.
