# Content authoring — schema v2

The learner production bank is authored in the three foundation task directories:
5 Write From Dictation, 6 Repeat Sentence and 6 Read Aloud items. The generated
catalog is installed by bootstrap through transactional IndexedDB sync.
`examples/`, including reserved technical fixtures, is excluded from production.
Historical snapshots under tests are migration evidence, never a learner source.

Six additional Wave 1 directories are registered but empty. Their typed `taskData`
contracts and technical fixtures are defined in [08.01](../docs/content/wave-1-contracts-08.01.md).
They are known to authoring tools but not practice-ready. CSV `taskData` cells use
JSON objects. New-task audio lives inside the payload as an `AudioAsset`; images
use an integrity-bearing `ImageAsset`. Image byte verification is deferred to
08.04 and image-bearing production builds currently fail closed. A valid draft
shape alone does not enable a learner exercise.

To author a draft:

1. Choose an implemented task: write-from-dictation, repeat-sentence or read-aloud.
2. Use `npm run content:reserve-id -- <task>` to reserve a permanent six-digit ID, or `content:new` for a draft scaffold. Never remove/reuse a registry entry. Copying an example is not permission to reuse its ID.
3. Author `<id>.json` in the matching task directory and supply id, taskType, difficulty, prompt, revision, status and source. Keep generated/imported unfinished content in draft for review. Provenance category alone does not establish permission to redistribute.
4. Run `npm run content:validate -- path/to/item.json [another.json]` and fix every error. All supplied files are checked together for duplicate IDs. Warnings are shown and require review, but do not make the preview fail.

`npm run content:validate` with no paths discovers the registered production task directories. Explicit paths may preview examples or drafts. It is structural validation, not a content build. Exit 0 means the supplied shape/batch passed; exit 1 means syntax, read or validation errors. This command checks structural/batch rules; audio bytes are checked by import/build and `content:verify-audio`. Drafts passing validation are excluded from practice.

Use [schemas/question-bank.schema.json](schemas/question-bank.schema.json) for editor assistance. Its `$id` is an internal identifier, not a hosted service. Do not put `$schema`, `createdAt`, `audioUrl` or any other unknown key into an authored item. The runtime parser is authoritative; editor validation cannot prove answer/transcript equality, review approval, file existence or decoded audio correctness.

New IDs: `wfd-000001`, `rs-000001`, `ra-000001`; zero, upper-case prefixes and different digit widths are invalid. Only the 17 explicitly grandfathered short IDs remain valid permanently; do not create `rs-007`. Do not rename existing identities to padded IDs.

Canonical shape and full rules: [06.02 validation](../docs/content/validation-06.02.md). Stable identity, lifecycle and revisions: [06.01 contract](../docs/content/contract-06.01.md).

The schema generator `node tools/content/schema.mjs --write` refreshes only the documentation artifact from shared policy. Building content never rewrites it.

Production authoring directories are `write-from-dictation/`, `repeat-sentence/` and `read-aloud/`. Use one item per `.json` file in its task directory. Only these trees are discovered; `examples/` is excluded. The three `*-900001` technical records live under `examples/technical`; their
IDs remain permanently reserved, and no technical item enters the production bank.

```bash
npm run content:validate       # production sources, or pass explicit authored files
npm run content:build          # validates production trees and writes bundle + manifest
npm run content:stats          # current source counts and warnings, without writes
npm run content:verify         # verifies the generated pair
```

Commit source changes and both `src/generated/question-bank*.json` artifacts together. Errors fail the build and preserve last-good outputs; do not package those stale files after a failed build. Warnings remain visible. Empty production builds fail. See [06.03 build policy](../docs/content/build-06.03.md) for exact ordering, byte/hash rules, limits, recovery and packaging. Audio integrity and migration are implemented. Imported content still requires explicit human activation.

[06.04 sync](../docs/content/sync-06.04.md) provides the transactional installer
used by bootstrap. Catalog omission changes local availability, not authored
lifecycle/revision. Sync failure preserves a usable previous bank and displays a
controlled warning; a fresh initialization failure displays a startup error.

Audio integrity (06.06): production references map exclusively to `public/audio`.
Only MP3 is currently supported. Audio on active/retired items requires a lowercase
SHA-256; draft references may omit it but any referenced file must still exist and
fully decode. Builds never generate/repair audio or fill metadata automatically.
Use `npm run content:verify-audio` for a JSON report, or append `-- --legacy` to
check the same 11 canonical WFD/RS references (compatibility flag). Missing
published duration is a warning; unreferenced managed assets are also warnings.
See [audio policy](../docs/content/audio-06.06.md) for bounds and decoder protections.

Authoring/import (06.07): allocate permanent IDs through `content:reserve-id` or
create a draft scaffold with `content:new`. Production source filenames must be
`<id>.json`; never delete entries from `id-registry.json` or reuse withdrawn IDs.
The entire `900000–999999` suffix range is reserved for technical content.

```bash
npm run content:ids
npm run content:new -- read-aloud
npm run content:import -- questions.csv --source internal --allocate-ids --dry-run
npm run content:import -- questions.csv --source internal --allocate-ids
```

Imports only create drafts, require explicit provenance and never overwrite/update
an existing ID or automatically build/publish. CSV arrays are JSON array cells;
unknown columns and malformed content fail. Any referenced audio must already be
local and valid. Commercial question banks require permission; `licensed` alone
is not evidence. Review content, metadata, difficulty, copyright and audio before
explicit activation. See [authoring policy](../docs/content/authoring-06.07.md),
including staging/lock recovery and the full developer workflow.
