# Activity 06.02 — JSON content and runtime validation

Status: implemented. Production arrays/seed/bootstrap, Dexie version 2, scoring and study UI are unchanged. Source examples are drafts and are not production questions. No bank bundle, content hash, installed manifest, sync, audio decode/existence check, importer or allocator is introduced.

## Canonical JSON

One UTF-8 JSON file contains one item. Allowed keys are exactly id, taskType, difficulty, prompt, answer, transcript, audio, chunks, phraseGroups, stressWords, revision, status, source, tags, skills, topic and estimatedSeconds. No envelope or per-item schemaVersion key is required; the schema artifact identifies v1. Unknown fields at the item or audio level are errors, including createdAt and legacy audioUrl.

```json
{
  "id": "rs-000001",
  "taskType": "repeat-sentence",
  "difficulty": 2,
  "prompt": "Listen and repeat the sentence.",
  "answer": "The lecture starts at nine tomorrow.",
  "transcript": "The lecture starts at nine tomorrow.",
  "revision": 1,
  "status": "draft",
  "source": "generated",
  "skills": ["listening", "speaking"],
  "tags": ["academic", "schedule"],
  "topic": "schedule",
  "estimatedSeconds": 10,
  "audio": { "path": "/audio/rs/rs-000001.mp3" },
  "chunks": ["The lecture", "starts at nine", "tomorrow"]
}
```

Examples: [content/examples](../../content/examples). Generated/imported material needs provenance/review before activation; source is not a license or a review marker. The validator cannot establish external permission or human approval from a source enum.

## Parser boundary

[src/domain/content/validation.ts](../../src/domain/content/validation.ts) exports:

- `parseQuestionBankItem(input: unknown): QuestionBankItem`: all-or-nothing validation; throws ContentValidationError with readonly issues and optional itemId.
- `safeParseQuestionBankItem(input: unknown)`: discriminated success/data or failure/errors, never an invalid data payload.
- `parseQuestionBankItemJson(input: unknown)`: text → JSON parse → item parser. INVALID_JSON distinguishes malformed syntax from structural/task errors; raw parser exception/source text is not returned. Repeated object keys (including escaped duplicates) fail with DUPLICATE_JSON_KEY instead of accepting a last-value override. Container depth above 64 fails with JSON_TOO_DEEP.
- `validateQuestionBankItems(input: unknown)`: validates every row, aggregates errors/warnings, checks duplicates and returns items only on total success. Invalid/nonarray/over-budget batches fail; an empty batch is valid (catalog completeness is a later build concern).

Call the parser; do not cast JSON to QuestionBankItem. The parser narrows/checks primitives and constructs the result without an unknown-to-item cast. Input is not changed. Returned items, nested audio objects and copied arrays are frozen; field order may be constructed afresh, but text/case/spacing and meaningful array order are preserved. Whitespace-only strings fail; valid text is never silently trimmed/lowercased/punctuation-corrected. Plain objects with data properties only are accepted, including null-prototype dictionaries; getters, class instances, nonenumerable/symbol fields, sparse arrays and arrays with extra properties are not canonical JSON inputs.

## Required fields and lifecycle

Every lifecycle requires a valid ID/task, integer difficulty 1–5, positive safe-integer revision, exact status/source and nonempty prompt. Missing values are errors, not defaults. Optional fields must validate if supplied; undefined/null is not omission. Skills use only listening/reading/speaking/writing and have no duplicate exact entries.

| Lifecycle | Task requirements | Skills |
| --- | --- | --- |
| draft | May omit answer/transcript/audio/chunks; prompt still required | Optional; empty array allowed |
| active or retired WFD | answer, transcript, audio; answer exactly equals transcript | Required, at least one |
| active or retired RS | answer, transcript, audio, nonempty chunks; answer exactly equals transcript | Required, at least one |
| active or retired RA | answer and transcript; answer exactly equals transcript; audio optional | Required, at least one |

Retired is treated as published, not an excuse for malformed/missing historical content. Withdrawal of an unfinished draft is not represented as an incomplete published retired row; preserve its reserved identity outside the current source rows until the authoring registry exists. The parser validates a snapshot, not transition history, revision monotonicity or provenance approval; those require prior catalog/registry state in later steps.

Whenever both answer and transcript are supplied, equality is enforced even for drafts. Optional chunks/phraseGroups/stressWords must be nonempty arrays with nonempty entries when present. Chunks and groups may repeat and retain order; semantic coverage against the transcript is deferred. Stress words reject exact duplicate entries, without stemming/case folding. Tags may be empty but reject duplicates and preserve case/order. Metadata is not inferred from the task.

## ID and audio reference rules

All 17 exact legacy IDs in the frozen [validation policy](../../src/domain/content/validationPolicy.ts) are valid, with matching task prefix. New IDs require exactly six digits and a nonzero suffix. New short IDs, zero IDs, upper-case prefixes, different widths or surrounding whitespace fail. No ID is padded, aliased or normalized. Allocation/recycling and historical monotonicity require a later registry, not just this syntax check.

Audio is a plain object with required path and optional sha256/durationMs/mimeType, with no extra keys. Paths must start `/audio/` and use nonempty ASCII alphanumeric/underscore/hyphen segments with internal single dots. Reject remote/protocol-relative URLs, filesystem/drive paths, backslashes, spaces/control bytes, percent escapes, traversal/dot segments, repeated slashes, trailing slash, query and fragment. This conservative syntax also rejects hidden filenames. Final newlines are rejected explicitly rather than relying on JavaScript's permissive `$` end anchor.

SHA-256 is exactly 64 lowercase hex characters. durationMs is a positive safe integer (refines the broad number type from 06.01). estimatedSeconds allows positive finite decimals. MIME is an `audio/<subtype>` token up to 100 characters, without parameters; e.g. audio/mpeg, audio/webm, audio/mp4. Subtype spelling is preserved. These are declared attributes only: extension/MIME consistency, actual bytes/duration/hash, file existence, symlink safety and decode are 06.06. Passing validation does not make the illustrative audio available offline.

## Implementation safety bounds

These are authoring bounds, not official PTE limits:

| Field/resource | Limit |
| --- | --- |
| id | 64 Unicode characters, plus strict ID syntax |
| prompt/answer/transcript | 10,000 Unicode characters each |
| topic | 200 Unicode characters |
| tag / tags | 100 characters / 50 entries |
| chunk/group/stress entry / each list | 1,000 characters / 200 entries |
| skills | At most four distinct known skills |
| audio path / MIME | 512 ASCII characters / 100 characters |
| revision / audio durationMs | Positive safe integer, at most 9,007,199,254,740,991 |
| JSON text per item / container depth | 2 Mi UTF-16 code units / 64 levels |
| batch | 10,000 items |

String bounds use Unicode code points, matching JSON Schema maxLength. Text budgets and batch budgets are separate. The preview CLI reads only regular files, caps I/O at 8 MiB (conservative UTF-8 byte envelope for the text budget), detects growth while reading and rejects invalid UTF-8 rather than replacing bytes. A BOM is not silently stripped; raw JSON parsing rejects it. Other future loaders must enforce bounded I/O as well. No unlimited recursion over arbitrary objects occurs: the validator inspects the fixed v1 fields and known arrays/audio only.

## Structured errors and warnings

Issues carry path, stable code and actionable message. Batch issues add itemId when available and prefix paths with `items[index]`. Examples: difficulty / INVALID_DIFFICULTY; answer / ANSWER_TRANSCRIPT_MISMATCH; items[1].id / DUPLICATE_ID. The exact user value is not needed in the message. Required task fields use REQUIRED_FIELD; malformed optional types are errors too.

Duplicate ID is always a hard error, including across lifecycle/revision or otherwise invalid rows. A batch has at most one current representation of each ID. Historical revision archives are not multiple current source rows in v1.

Exact same-task prompt, answer and transcript values generate DUPLICATE_PROMPT, DUPLICATE_ANSWER and DUPLICATE_TRANSCRIPT warnings. Generic shared instructions can legitimately warn. Shared audio paths among valid active items generate DUPLICATE_AUDIO_PATH across tasks. Text matching is exact, without normalization; audio warnings exclude drafts/retired. Each later duplicate points to the first row, avoiding quadratic pair reports. Warnings are explicit and do not fail preview/build; authors should review them. An invalid batch returns diagnostics and no partially accepted items array.

## JSON Schema and authoring preview

[question-bank.schema.json](../../content/schemas/question-bank.schema.json) is a draft-2020-12 editor/documentation artifact with stable internal `$id` and x-pte-schemaVersion 1. [tools/content/schema.mjs](../../tools/content/schema.mjs) generates it from shared runtime bounds, field/legacy registries and publication requirements. A test checks exact artifact parity so structural changes cannot silently leave a stale committed schema.

Standard JSON Schema cannot compare answer to transcript. The artifact explicitly declares this runtime-only semantic rule under x-pte-semanticRules and its `$comment`; editors do not execute the annotation. Runtime validation is authoritative even when editor validation passes. Batch duplicate diagnostics and JavaScript non-JSON object rejection are also outside single-item editor schema scope. No runtime validation framework/dependency is added.

`npm run content:validate` validates exactly the three draft examples. With explicit file arguments it validates those files as one batch, including duplicate checks. It reads no production bank and writes no bundle/database/manifest. Nonzero exit means file read, JSON syntax or validation error. Practical authoring/reservation workflow: [content README](../../content/README.md).

## Tests and next step

Unit tests use independent primitive/field/task cases, valid/invalid JSON fixtures, all 17 legacy IDs, exact new IDs, whitespace/Unicode preservation, immutability, duplicate aggregation, warning-only success, malformed JSON, schema parity and CLI exits. Full app/runtime regression, build, lint and diff checks accompany this step. Current starter bank stays untouched.

Validation evidence: `npm test` — 405 PASS (including 148 content-validator cases); `npm run build`, `npm run lint`, `npm run content:validate` and `git diff --check` — PASS. No new dependency was required. The production frontend asset hashes remained unchanged.

Next: 06.03 deterministic discovery/build/bundle/manifest/hash. Do not treat these fixtures as migrated production content. Audio existence/decode is 06.06; seed/sync/DB upgrades are 06.04; allocator/importer is 06.07. No scoring changes are part of authored validation.
