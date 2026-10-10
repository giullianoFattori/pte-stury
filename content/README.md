# Content authoring — schema v1 preview

The production WFD/RS/RA bank still lives in `src/data/question-bank/`. Files under `examples/` are **validation examples only**, all drafts. They are not installed, seeded, imported into IndexedDB or packaged as a production question bundle. Referenced audio is illustrative and need not exist at this stage.

To author a draft:

1. Choose an implemented task: write-from-dictation, repeat-sentence or read-aloud.
2. Reserve a never-used six-digit ID with its task prefix (nonzero). Allocation is manual for now: check all allocated identities, including retired/withdrawn ones, and record the reservation. Copying an example is not permission to reuse its ID. Automated allocation is 06.07.
3. Copy a draft example and supply id, taskType, difficulty, prompt, revision, status and source. Keep generated/imported unfinished content in draft for review. Provenance category alone does not establish permission to redistribute.
4. Run `npm run content:validate -- path/to/item.json [another.json]` and fix every error. All supplied files are checked together for duplicate IDs. Warnings are shown and require review, but do not make the preview fail.

`npm run content:validate` with no paths validates exactly the three checked-in examples. It is a thin preview, not directory discovery or the future bank build. Exit 0 means the supplied shape/batch passed; exit 1 means syntax, read or validation errors. Missing audio is not checked yet. Drafts passing validation are still excluded from future practice.

Use [schemas/question-bank.schema.json](schemas/question-bank.schema.json) for editor assistance. Its `$id` is an internal identifier, not a hosted service. Do not put `$schema`, `createdAt`, `audioUrl` or any other unknown key into an authored item. The runtime parser is authoritative; editor validation cannot prove answer/transcript equality, review approval, file existence or decoded audio correctness.

New IDs: `wfd-000001`, `rs-000001`, `ra-000001`; zero, upper-case prefixes and different digit widths are invalid. Only the 17 explicitly grandfathered short IDs remain valid for later migration; do not create `rs-007`. Do not rename existing identities to padded IDs.

Canonical shape and full rules: [06.02 validation](../docs/content/validation-06.02.md). Stable identity, lifecycle and revisions: [06.01 contract](../docs/content/contract-06.01.md).

The schema generator `node tools/content/schema.mjs --write` refreshes the documentation artifact from shared policy. It does not build question bundles, allocate IDs, generate a content hash or synchronize learner data. Those remain later steps.
