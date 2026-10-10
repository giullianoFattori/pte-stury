# Activity 06.03 — Deterministic question bank build

The generated catalog is build infrastructure, **not the current learner bank**.
The application still uses the existing TypeScript arrays and `seedQuestionBank()`.
No IndexedDB migration, scoring, bootstrap or exercise UI changed. Content sync is
06.04; production question migration is 06.08.

## Sources and validation

One UTF-8 JSON file represents one canonical `QuestionBankItem`. Only these
registered trees are discovered, recursively to depth 16:

- `content/write-from-dictation/`
- `content/repeat-sentence/`
- `content/read-aloud/`

`examples/`, `schemas/` and unrelated directories are excluded. Item task type
must agree with its registered directory. Logical diagnostics use
`content/<task>/<file>` paths, including when test APIs use a temporary root.
Files sort by lexicographic JavaScript string comparison, independent of locale.
Only lowercase `.json` source extensions are allowed; other files fail except
the explicitly ignored regular files `.gitkeep`, `.DS_Store` and `Thumbs.db`.
Hidden files are otherwise not silently ignored. Symlinks, including directory
components, nonregular files and missing registered directories fail closed.

The shared reader uses `O_NOFOLLOW` where supported, compares the opened file to
the initial identity, reads bounded chunks and checks size/mtime/ctime after the
read. Each source is limited to 8 MiB bytes, plus the authoritative 06.02 parser's
2 Mi UTF-16 code-unit/depth limits. UTF-8 decoding is fatal; BOM is preserved for
the existing parser to reject. Discovery limits are 10,000 JSON files, 40,000
visited entries, 40,000 entries per directory and depth 16. Aggregate source and
canonical bundle byte budgets are 128 MiB. These are implementation safety limits,
not PTE task limits. Same-user filesystem mutation races are not an OS sandbox;
authors must build from a controlled checkout.

`parseQuestionBankItemJson()` and `validateQuestionBankItems()` remain authoritative.
There is no second implementation of item semantics. Read, syntax, placement and
validation failures aggregate into structured diagnostics. Duplicate IDs always
fail; duplicate prompts, answers, transcripts and active audio references remain
visible warnings. No last-file-wins behavior or correction occurs. Source JSON
must contain one item; multi-item files fail item validation.

An ordinary production build rejects zero items. `allowEmpty: true` exists only
on the exported build/test API; the production CLI accepts no bypass flags.
An all-draft catalog is valid and explicitly reported as **zero active items**.

Three checked-in non-live drafts exercise the pipeline while migration is deferred:
`wfd-900001`, `rs-900001`, `ra-900001`, tagged `build-fixture`. These permanent
identities are reserved for technical fixtures and must never be reused as learner
questions or activated. Future migration must retire or withdraw these fixtures
and independently verify a populated active practice bank. Do not mistake this
step's three catalog rows for production questions or audio evidence.

## Canonical bytes and identity

Bundle shape: `{ "schemaVersion": 1, "items": [...] }`, without time or paths.
Task order is **write-from-dictation, repeat-sentence, read-aloud**. Within each
task, IDs ascend by locale-independent string comparison.

Property order uses the shared schema-v1 field registry:

```text
id, taskType, difficulty, prompt, answer, transcript, audio,
chunks, phraseGroups, stressWords, revision, status, source,
tags, skills, topic, estimatedSeconds
```

Audio order: `path, sha256, durationMs, mimeType`. Absent optional fields are omitted.
Tags and skills are copied and sorted as sets using the same string comparator.
Chunks, phrase groups and stress words retain authored order. Authored text is
preserved, including whitespace, case, punctuation and Unicode decomposition;
there is no trimming or Unicode normalization. The input is never mutated.

Output is UTF-8, two-space JSON indentation, LF and a final newline. JSON escaping
represents authored string content without changing its value. SHA-256 is over
the **exact encoded bundle bytes**, yielding `sha256:<64 lowercase hex characters>`.
Filenames, key order, indentation and tags/skills order do not affect identity.
Semantic fields and semantic array ordering do. Item revision policy remains the
author's responsibility; the builder cannot compare against historical revisions.

## Manifest and statistics

`src/generated/question-bank.manifest.json` uses the existing 06.01 contract:
schemaVersion, contentVersion, itemCount, countsByTaskType and audioAssetCount.
Counts include every lifecycle state; all three task keys are present even at zero.
Audio count is distinct referenced paths, without checking file existence or bytes.
The bundle is hashed first; the manifest containing that hash is never self-hashed.

`content:stats` validates current sources without writing output. It reports total
catalog rows, draft/active/retired counts, every task/difficulty, distinct audio
references and warnings. Total rows are never labeled active practice count.

## Output installation, failure and verification

The generated directory is reserved for exactly the bundle and manifest. Both
files are staged together in a sibling `.generated.content-next` directory and
verified before installation. A developer lock prevents ordinary concurrent
builds. A verified old output is moved to `.generated.content-previous`, then the
complete staged directory is renamed to `generated`. A failed install rename
restores the old directory; normal success/failure removes staging and lock files.

Portable filesystems do not support an atomic exchange of two directories through
Node's rename API. Readers can see a brief **missing directory**, never a mixture
of old/new files. Consumers fail closed and should retry after the build finishes.
This is not a power-loss durability guarantee; files/directories are not fsynced.
A subsequent valid build recovers a verified crash backup and removes only known
regular staging files. Malformed or unsafe leftovers fail closed for manual review.
PID reuse can conservatively block stale-lock recovery; a live PID is never stolen.
Same-user malicious replacement of lock files is outside this developer-tool lock
boundary. Catastrophic filesystem/cleanup failures may leave a verified backup or
complete new pair and require inspection; no success is reported in that case.

Source validation failures happen **before** staging and preserve both last-good
outputs. The command exits nonzero; those files are stale evidence, not a new build.
Run a successful build and parity tests before packaging. Do not bypass a failed
build by packaging last-good output.

`content:verify` checks directory/file safety, exact schema, item validation,
canonical bytes, recomputed SHA-256 and all derived counts. It rejects unknown
manifest fields, altered counts, noncanonical bundles and mismatched pairs. It
does not prove that artifacts match changed source files; source parity tests do.

Generated bundle and manifest are committed for review. Tests prove exact parity
with the registered production sources and retain the 06.02 schema-artifact check.
The build never rewrites JSON Schema.

## Commands and package integration

```bash
npm run content:validate       # explicit example/file preview from 06.02
npm run content:build          # production discovery, validation and installation
npm run content:stats          # current sources, no writes
npm run content:verify         # generated pair integrity
npm test
npm run build
npm run lint
npm run package:test
git diff --check
```

The platform package build scripts invoke content build before regressions/staging.
Staging verifies the pair and copies it to `web/content/` before package inventory
generation. Both files receive exact size/SHA-256 entries and are served same-origin
with JSON MIME, CSP, nosniff and no-store. Nothing in the learner app requests them
yet. Packaged runtime code imports neither the source validator nor Node authoring
tools. Production frontend remains unchanged; offline assets remain package-owned.
This does not close existing Windows/macOS or clean-machine release gates.

Deferred: content sync/retirement, production migration, audio existence/hash/decode,
CSV imports, ID allocation, scale corpus, new task types and study-session logic.

## Validation evidence

On 2026-10-10, all 441 app/runtime tests passed, including 36 new build-pipeline
tests; all five package tests passed. `content:validate`, `content:build`,
`content:stats`, `content:verify`, frontend build, lint and diff whitespace checks
passed. The unchanged production frontend emitted `index-aV0bwYaq.css` and
`index-DvyuR3Co.js`. The generated bank has three technical drafts, zero active
items and zero audio references. Content version:
`sha256:69780bb9094ecc13f70d107c35037b9396c77851f35b06c1c1e01a21e7c8fbf5`.

Linux x64 staging and package verification passed with 73 owned artifacts
(306,484,517 bytes). The internal host smoke passed using bundled Node 24.21.0
and native tools with host PATH unavailable: verification 277 ms, runtime ready
3,493 ms, first controlled transcription 2,889 ms. Single-instance behavior,
port collision, restart and Quit during inference passed without an orphan native
process. All 36 new build tests also passed with bundled Node 24.21.0, after the
final bounded lock-reader adjustment. The first smoke encountered an already-running prior package; it was
quit through its launcher before the isolated repeat passed. These are host
measurements, not clean-machine, real learner quality or other-platform evidence.
Existing Activity 05 release/model gates remain pending.
