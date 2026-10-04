# Activity 04 — Step 01: Read Aloud Content Model and Question Bank

Project: PTE Study App

Date: 2026-10-04

## Content contract

Read Aloud uses visible text. The six starter passages are the passages supplied
for Step 01, with IDs `ra-001` through `ra-006`, two at each difficulty 1–3.
All use `Read the text aloud clearly and naturally.` and the fixed content
timestamp `2026-10-04T00:00:00.000Z`.

`StudyItem` now has two explicit optional properties:

```ts
phraseGroups?: string[];
stressWords?: string[];
```

These supersede the earlier proposal to reuse `chunks` and introduce positional
stress indices. `chunks` retains its RS memory-unit semantics. RA phrase groups
support phrasing, breathing and rhythm preparation; they are not memory chunks
or mandatory measured pauses.

Each RA item contains `answer === transcript`, phrase groups and curated stress
words. It contains neither `audioUrl` nor `chunks`. No generic metadata container
or scoring field is introduced. Stress words are preparation targets, not an
official score or evidence of the learner's pronunciation. V1 lists a repeated
word once; metadata does not distinguish individual occurrences.

## Integrity

Phrase groups retain every passage word in order. The supplied phrase groups
omit sentence punctuation, while canonical passages preserve it. Therefore
validation compares their normalized token sequences using the existing shared
normalizer/tokenizer, including punctuation removal, rather than literal
whitespace-only string equality. This checks omission, duplication and ordering
without changing the supplied text or phrase groups. Hyphenated `long-term`
remains one token under the existing tokenizer.

Every stress word is a normalized, unique single token present in its passage.
The content tests inspect the exported bank, check those invariants and verify
stable IDs, difficulty distribution, shared fields and absent audio/chunk fields.
The combined-bank regression expects five WFD, six RS and six RA starter items:
seventeen unique IDs.

## Seeding and persistence

`src/data/question-bank/read-aloud.ts` exports `readAloudQuestions: StudyItem[]`.
The existing `seedQuestionBank()` includes it alongside WFD and RS. Existing
bootstrap and `studyItemsRepository.upsert()` remain the entry points. Stable IDs
make repeated seeding idempotent and allow populated databases to acquire RA.
Seeding does not delete unrelated items or modify attempts/errors/reviews.

No Dexie version or index changes are required: the new fields are ordinary
stored properties and are not queried through indexes.

## Scope boundary

Step 01 adds content only. `/study/read-aloud`, silent-preview UI, microphone,
recording, local STT, scoring, pause/fluency analysis and learner outcomes remain
later work. `src/features/read-aloud/.gitkeep` stays in place. No RA audio assets,
scoring directory or shared-speaking refactor is added.

RS's real local-transcription quality gate remains pending and does not block
this content-only step. RA will share the browser limitations once speech
integration begins.

## Validation

Run `npm test`, `npm run build`, `npm run lint` and `git diff --check`.

In an isolated disposable browser profile, load an existing app route to trigger
bootstrap and inspect `pte-study-db.studyItems`:

- `studyItemsRepository.getByTaskType('read-aloud')` returns six records.
- IDs and every content field match the exported bank.
- Difficulty counts are 2/2/2/0/0 for levels 1–5.
- Fresh bootstrap contains seventeen starter items and no learner outcomes.
- Repeated reload/bootstrap leaves six RA records without duplicates.
- An existing eleven-item WFD/RS database gains six RA records without losing
  existing items, custom content or historical outcomes.

Do not delete real learner history to validate seeding. Optional fresh-state
checks belong in a disposable profile only.

Validation completed on 2026-10-04 using Edge 154 headless on localhost with a
separate disposable profile and real IndexedDB. Fresh state contained seventeen
starter records and zero learner outcomes. All six stored RA records exactly
matched the exported bank, and the repository query returned six with difficulty
counts 2/2/2/0/0. A simulated pre-RA eleven-item bank acquired RA on repeated seed;
WFD/RS records, a custom item and Attempt/ErrorRecord/ReviewItem payloads stayed
unchanged across three reloads. Dexie version remained 2.

Build, lint, all twelve test files and diff whitespace checks passed. The browser
validation script remained outside the repository and was removed after use.

## Next step

Activity 04 — Step 02 adds the Read Aloud exercise screen, silent preview,
training annotations and shared microphone/recorder integration. Extract shared
speaking infrastructure when RA becomes its second real consumer; keep RA
assessment separate from RS metrics.
