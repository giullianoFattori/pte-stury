# Authoring and import tooling — 06.07

Current status: [06.08](migration-06.08.md) migrated and activated all 17 learner
items. Earlier scope/result statements below describe the historical step boundary;
production authoring now uses canonical JSON and bootstrap uses generated sync.

New content enters as drafts through local developer commands. Authoring does not
seed IndexedDB, change learner scoring, download/generate audio, invoke a cloud
service or publish a catalog. The 17 learner questions now use the canonical bank through 06.08. The 06.07 checkpoint changed only technical filenames; 06.08 removed those
fixtures from production discovery while retaining their permanent reservations.

## Permanent identity registry

`content/id-registry.json` v1 is the durable allocation authority. It contains all
17 grandfathered identities, the three current `*-900001` technical identities and
an explicit permanently reserved numeric range `900000–999999` for each task.
Normal allocation uses the lowest unused six-digit suffix in `000001–899999`.
Historical short IDs cannot be newly allocated. An allocated ID is never released:
`reserved`, `retired` and `abandoned` all remain unavailable. Registry entries must
not be removed during content retirement or withdrawal. Historical IDs remain in
the explicit grandfathered set even if their registry kind becomes retired.

Only WFD, RS and RA are implemented. The registry is strict, bounded to 16 MiB and
100,000 entries, and validates unique IDs, task prefixes, kinds, baseline retention
and range policy. This is an authoring safety bound; larger permanent registries
will require a reviewed format/limit evolution. JSON syntax/depth/duplicate-key
checks are shared with canonical content validation, with a larger explicitly
bounded registry read budget. No availability is inferred from deleted source files.

```bash
npm run content:reserve-id -- repeat-sentence
npm run content:new -- repeat-sentence
npm run content:ids
```

`reserve-id` irreversibly reserves one identity without creating a question.
`new` reserves first, then creates `<id>.json` in the task directory with revision
1, internal source, draft status, difficulty 1 and an explicit placeholder prompt.
Replace/review those scaffold values before publication. If file creation fails,
the ID remains reserved and is returned in the structured failure report.

The normal ID audit is read-only. It reports counts, next IDs, technical range and
explicit technical reservations, current source IDs and reservations without source
files. Missing source files are valid historical/abandoned reservations, not IDs to
release. Current production sources must have registered IDs, matching task folders
and exact `<id>.json` filenames. Production builds enforce these rules; internal
serialization tests may disable filename checks to test source-order independence.

## JSON and CSV inputs

```bash
npm run content:import -- questions.json --source internal --dry-run
npm run content:import -- questions.csv --source generated --allocate-ids --dry-run
npm run content:import -- questions.csv --source generated --allocate-ids
```

JSON accepts one canonical-shaped object or an array. CSV uses a strict bounded
RFC4180-style parser supporting quoted commas/newlines, doubled quotes and Unicode.
Quoted text preserves original CRLF/LF, spaces, punctuation and case. There is no
comma splitting, delimiter guessing, spelling correction or semantic normalization.
BOM, malformed quotes, duplicate headers, unknown columns and mismatched row widths
fail closed. Inputs must be regular non-symlink UTF-8 files, at most 8 MiB on disk,
2 Mi code units after decoding, and 1–10,000 records. Item limits still apply.

Supported CSV columns are:

```text
id taskType difficulty prompt answer transcript
revision status source skills tags topic estimatedSeconds
chunks phraseGroups stressWords
audioPath audioSha256 audioDurationMs audioMimeType
```

Headers and enum values are exact; whitespace in a header is not trimmed. Empty
CSV cells mean an absent field. Whitespace-only required text remains invalid.
Numeric cells use explicit unsigned decimal notation; canonical validation then
checks integer difficulty/revision/duration and bounds. JSON numeric strings are
not coerced. Array cells contain JSON arrays, for example:

```csv
chunks,"[""The lecture"",""starts tomorrow""]"
```

Audio fields map explicitly into `audio.path/sha256/durationMs/mimeType`.
Metadata without audioPath fails. Any referenced audio must already pass the
06.06 local integrity check, even on a draft. To author before an asset exists,
omit the audio fields and add/verify them later. The importer never fetches or
copies arbitrary media. MP3 restrictions and published hash requirements remain.

`--source internal|licensed|generated|imported` is mandatory on batch import.
If a row includes source it must agree with the batch declaration. Missing status
means draft; an explicit active/retired/invalid status is rejected, never rewritten.
A new row with omitted revision starts at 1; supplied revisions are validated,
including rejection of null. Difficulty/prompt and task fields are not inferred.

Preserve-ID mode is the default and requires explicit valid IDs in every row.
`--allocate-ids` requires rows **without** IDs and simulates/reserves normal IDs.
The two modes cannot be mixed. Any ID already in the registry, current sources or
batch is a hard collision. Generic import is not an update mechanism. Edit an
existing authored item explicitly, increment revision for semantic changes and
run normal validation/build. A previously reserved ID is also not eligible for
generic preserve-ID import; author it manually or use `content:new` for scaffolding.

## Validation and dry-run

Stages are independently callable and tested: input parsing, record mapping,
canonical batch validation, registry allocation and staged installation. All
items pass `validateQuestionBankItems()`/`parseQuestionBankItem()` semantics;
answer/transcript equality, task rules, safe audio references and unknown fields
are not bypassed. Duplicate prompts/text/audio remain visible nonfatal warnings.
Draft files use the existing explicit canonical property order, including sorted
set-like tags/skills and preserved semantic chunks/groups/stress order.

Dry-run parses/maps/validates, checks collisions and audio, and reports advisory
IDs without creating locks, reserving IDs, recovering staging, writing history,
changing source files or building outputs. Concurrent authors may change the next
ID before the actual import. Real import rechecks everything under the registry
lock. Invalid query/input and normal validation errors have stable structured
codes/field paths. Native errors and machine absolute paths are never echoed.

## Lock, installation and recovery

Authoring and production builds share `content/.author-lock`, acquired by atomic
directory creation with PID/instance metadata. Concurrent writers fail with
`ID_REGISTRY_LOCKED` and can retry. Build source discovery/validation/output
installation run under that lock to avoid reading a partially installed import.
Read-only production stats/prepare reject a pending lock/stage.

Each batch validates before reserving, stages complete canonical drafts and safe
history behind a rollback journal, checks staged bytes, then atomically replaces
the registry using a flushed same-directory temporary file. Only after the ID
commit are draft/history files installed with exclusive hardlinks. Existing files
are never overwritten, including races where a destination appears after preview.
Staging and registry failures before commit install no sources. Failures after
commit roll back owned destination links but never release the committed IDs.

A multi-file source install is not a single filesystem rename. Cooperative builds
are excluded by the shared lock; ordinary failures roll back the whole owned batch.
A crash with a valid journal is conservatively rolled back by the next locked
build/import/reservation. Recovery validates filenames, canonical bytes/hash and
inode ownership before removing any targets. If a user changed/replaced a target,
recovery fails with `AUTHOR_RECOVERY_REQUIRED`, preserving that file and leaving
staging for explicit inspection. Pre-commit partial writes are discarded only when
all staging entries are known regular files and no source links were installed.

```bash
npm run content:ids -- --recover-stage
```

This explicitly recovers a valid pending stage and audits IDs without allocating.
It does **not** steal a live/stale lock. After a crashed owner, inspect
`content/.author-lock/owner.json` and verify the owner process is dead before
explicitly removing that lock and running recovery. PID reuse remains ambiguous;
locks are never automatically stolen. Malformed journals/staging require manual
inspection. Symlinks and unexpected files fail closed.

The filesystem must support same-volume hardlinks and atomic registry rename.
Registry contents are flushed before rename, but complete power-loss durability
of every directory is not claimed. Trusted authoring roots and append-only registry
review are required; a malicious same-user process/manual deletion of the registry
is outside this tooling's protection boundary. Git review/backup retains abandoned
reservations. No command offers ID reset, release or reuse.

## Provenance, review and outputs

Successful batches write `content/import-history/<batch-uuid>.json`: source,
sanitized input basename, timestamp, item IDs and optional bounded `--note`.
No input absolute path, raw CSV, source transcript dump or credential is stored.
Notes must not contain secrets, personal information or private filesystem paths;
use a safe human provenance description/public permission reference.

Commercial PTE prep-bank content must not be imported without permission.
`licensed` is only a declaration, not proof of permission. Generated/imported
content remains draft until a human reviews linguistic accuracy, task suitability,
difficulty, metadata, provenance/copyright and audio quality/integrity. Promotion
is an explicit authored edit; no command performs draft → active automatically.

Reports are JSON, with input count, created drafts, reserved count, item IDs,
warnings, batch ID, audio stats and timings. Failure reports retain committed IDs
and identify manual recovery needs. Synthetic 100/1,000-item fixtures are created
and deleted under isolated temporary roots, never committed as production questions.
Timings cover parse, mapping, validation, simulated allocation and actual
stage/reservation/install; these are Linux-host Node/filesystem measurements,
not browser startup or cross-platform package evidence.

Recommended workflow:

1. Prepare JSON/CSV and choose explicit source/ID mode.
2. Dry-run; resolve errors and review warnings.
3. Import drafts; commit registry/history with source files.
4. Add and verify audio if not already referenced.
5. Validate authored text/metadata; perform human content/provenance review.
6. Explicitly promote only reviewed items and increase revision for changes.
7. Run content validation/audio verification/build/verification.
8. Commit sources, permanent registry, safe history and generated artifacts.

No importer command invokes content build/publishing. Learner bootstrap, scoring,
Dexie v3 and the current 17 live question definitions are unchanged. 06.08 owns
their migration and bootstrap switch. Activity 05 human-model, clean-machine,
Windows/macOS and signing gates remain pending.

## Validation evidence

PASS on the Linux development host: 651 app/runtime tests, 6 package tests,
69 focused authoring/import tests using Node 24.21.0 LTS, frontend build, warning-free
lint, every content command and `git diff --check`. New reserve/new/audit/recovery
CLIs were exercised against isolated roots; production import was tested only as
dry-run. No normal IDs were allocated in the committed production registry.

The committed audit `audits/authoring-06.07.json` records 100/1,000-row timing
breakdowns without private paths or synthetic question text. End-to-end import
was approximately 89 ms / 898 ms in that isolated LTS run, with no acceptance
threshold inferred. Existing generated bundle/manifest bytes and contentVersion
remain identical. Scope complete; production learner migration remains 06.08.
