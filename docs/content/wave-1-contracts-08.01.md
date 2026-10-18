# Activity 08.01 — Wave 1 scope and task contracts

Status: implementation complete; validation evidence is recorded in
`audits/wave-1-08.01.json`. This closes the contract step only, not Activity 08.
Official task facts and implementation order are frozen in
[the Pearson specification record](../pte-spec/wave-1-2026-10.md).

## Registry and rollout

`src/domain/pte/taskRegistry.ts` is authoritative for labels, skill mappings,
sections, wave membership, prefixes, canonical order and readiness. Known order is
WFD, RS, RA, Retell Lecture, Summarize Group Discussion, Describe Image, Summarize
Written Text, Summarize Spoken Text, Highlight Incorrect Words. Prefixes for the
six additions are `rtl`, `sgd`, `di`, `swt`, `sst`, `hiw`.

Only WFD/RS/RA are practice-ready. Selectors, repository practice queries,
application preparation, initialization and final persistence checks enforce this
boundary. Historical lookups still resolve installed unfinished records.
`QUICK_TASK_POOL` explicitly lists the foundation three; enabling another task
does not automatically expand Quick. No new exercise, route, scoring algorithm or
learner production question is included.

The permanent registry contains 17 legacy identities, nine technical reservations
and two abandoned normal reservations. During validation, a test passed an
undefined temporary root to the scaffolder and accidentally reserved
`rtl-000001`/`rtl-000002` in the working content tree. The test was fixed and both
scaffolds withdrawn before publication. Their allocation audit records remain;
these IDs will never be reused. Retell Lecture's next normal ID is `rtl-000003`.
Technical IDs also remain reserved if fixtures disappear.

## Content schema v2

The structural addition of `taskData` intentionally advances content schema 1 to
2. Dexie remains v3. The 17 canonical source records, their revision 1, wording,
audio, chunks, phrase groups, stress words and historical identities are unchanged.
Foundation fields remain at the root; there is no forced foundation migration.

Wave 1 uses typed payloads in `StudyItemDataMap`. `StudyItem<T>`,
`QuestionBankItem<T>` and typed readers expose the payload for a task.
`readTaskData()` checks runtime identity and validates the complete payload before
returning its specific type. Foundation payload entries are `never`.

| Task | Required taskData fields | Optional fields |
| --- | --- | --- |
| Retell Lecture | audio, transcript, keyPoints | keywords, image |
| Summarize Group Discussion | audio, speakers, turns, keyPoints | relationships |
| Describe Image | image, imageAlt, imageType, keyFeatures | keywords |
| Summarize Written Text | passage, keyPoints | referenceSummary |
| Summarize Spoken Text | audio, transcript, keyPoints | referenceSummary |
| Highlight Incorrect Words | audio, spokenTranscript, displayedTokens | — |

`audio` uses the existing `AudioAsset` object, rather than an unverified bare URL.
`image` uses `{path, sha256, bytes, mediaType, width, height}`. Installed foundation
audio still maps to `audioUrl` for compatibility. New tasks cannot use unrelated
legacy root content fields. Unknown nested fields, wrong types and unsafe paths
fail closed, without rewriting authored text.

Drafts can omit the entire payload for scaffolding. A supplied payload must be
complete even on a draft. Active/retired records require payload and skills;
published audio requires SHA-256. References to illustrative summaries do not
establish a single exact-match answer.

SGD requires exactly three uniquely identified speakers, all represented by turns
that reference known speakers. Authored speaker truth never depends on Whisper
diarization. HIW requires unique stable token IDs, at least one incorrect token,
and a distinct `spokenText` for each incorrect token. Joining spoken token values
with a single space must exactly equal `spokenTranscript`. This is an explicit
authoring rule, with no runtime tokenization/normalization. Correct tokens may
omit `spokenText` or repeat their displayed text.

The shared payload descriptor drives runtime validation and generated JSON Schema.
Cross-field speaker/token/image checks remain authoritative runtime rules.
Payload property order follows the descriptor; semantic arrays retain order;
top-level tags/skills retain the established sorted-set build policy.

## Assets, tooling and publication

Audio remains `/audio/...`, MP3 only, using the existing bounded hash/probe/full
decode pipeline. Nested references participate in manifest counts, duplicate
warnings and per-build media caching. No network inputs or asset downloads exist.

Images require safe `/images/...` paths, lowercase SHA-256, positive bytes up to
20 MiB, integer dimensions 1–16384, and matching PNG/JPEG/WebP extension/MIME.
These are implementation guardrails, not PTE limits. Image byte/hash/decode
verification is deferred to 08.04. Any image-bearing production build currently
fails with `IMAGE_INTEGRITY_NOT_IMPLEMENTED`; structural acceptance is not byte
certification. No image-bearing production item has been added.

`content:new`, reservation, import, discovery, canonicalization, manifest and audio
tooling recognize all nine identities. JSON import accepts canonical nested
objects; CSV accepts `taskData` as a JSON object cell with proper CSV quoting.
Existing draft-only/source/collision/lock/staging policies remain mandatory.
Six technical examples live exclusively in `tests/fixtures/wave1/`; the production
task directories are empty. Builds never discover these fixtures.

The generated production pair contains 17 active items (5/6/6), 11 unique audio
assets and six zero task counts. New contentVersion:
`sha256:714ea490c9e33763f94bdc7c95719c9480a2bde738c693d67fc103e413dc21bd`.
Its change reflects the schema wrapper; no item revision was invented. The old v1
hash was `sha256:bd666658b8e96465a676daf4881e8bb7c8322a1165b11fd14936e873a6b837c2`.
The installer can verify the previous v1 foundation-only pair solely to replace or
recover it atomically. Normal generated verification/publication requires v2.
Browser sync upgrades installed catalog state without rewriting unchanged items
or learner history. Old Attempts remain revision-unknown.

## Session extension boundary

Pure selection uses catalog lifecycle eligibility and supports synthetic 4–9-task
pools with capacity redistribution, deterministic remainder allocation, per-task
sampling and interleaving. The production preparation/query path separately
requires readiness. Tests cover small counts, equal task/count sizes, zero and
uneven capacities, exact capacity, insufficiency, immutability and determinism.

Summary integrity now starts from authoritative `Attempt.taskType`, the frozen
session ledger and the registered ID association. It no longer infers a task with
a three-prefix ternary. Metric handlers are explicitly registered for foundation
tasks only; an unsupported task fails safely rather than falling through to RA.
The exercise dispatcher similarly maps only implemented tasks and has safe
unknown/unready diagnostics.

Before each readiness flag can change, its implementation step must supply:
reviewed local content/assets, local metrics with documented meaning, exercise,
Attempt/Error/Review behavior, dispatcher entry, summary handler, standalone and
session/browser regression proof. No HIW response schema or official-score claim
was added prematurely.

## Validation and remaining scope

The audit records exact command results, test counts, source commit, dirty working
tree context, browser version and contentVersion. Existing Activity 07 browser
suites are rerun; Quick additionally asserts that both selectors omit all six new
tasks and its queue stays foundation-only. Previous Activity 07 package evidence
remains historical; 08.01 runs package tests, not a new packaged E2E certification.

Activity 05 clean-machine, Windows/macOS, physical-microphone, human benchmark and
signing gates remain PENDING. No model, speech runtime, scoring or IndexedDB index
change is part of this step. Next: **08.02 Retell Lecture**.
