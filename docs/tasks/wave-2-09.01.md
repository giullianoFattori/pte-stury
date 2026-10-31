# Activity 09.01 — Wave 2 scope and task contracts

**Status:** COMPLETE for scope/contracts. Verified 2026-11-01.

## Frozen scope

Wave 2 adds the 13 remaining scored task identities, in implementation order:

1. Listening: Fill in the Blanks — Type In
2. Reading: Fill in the Blanks — Dropdown
3. Reading: Fill in the Blanks — Drag and Drop
4. Reorder Paragraph
5. Respond to a Situation
6. Write Essay
7. Answer Short Question
8. Reading: Multiple Choice — Multiple Answers
9. Listening: Multiple Choice — Multiple Answers
10. Reading: Multiple Choice — Single Answer
11. Listening: Multiple Choice — Single Answer
12. Highlight Correct Summary
13. Select Missing Word

Pearson catalogue order, implementation order, practice order, and Quick pool are distinct registry exports. Personal Introduction is excluded. The current nine practice-ready tasks remain unchanged; Wave 2 is known but unready. Quick remains WFD / RS / RA.

## Contracts and persistence

Each task has a typed `taskData` payload and strict nested shape rules. Runtime validation adds referential checks for stable option/blank/block IDs, correct-option cardinality, segment-to-blank coherence, answer membership, image/alt pairing, and reorder permutations. `Attempt.responseData` now has additive discriminated variants for token selection, single/multiple choice, blank text/choice, and ordered blocks. Historical HIW records without a `kind` remain valid under their legacy response shape. There is no table/index change, so Dexie stays v3.

Question-bank schema stays v2 because the root envelope and taskData mechanism are unchanged; the 13 payload shapes extend the existing discriminated catalogue. The generated schema artifact and ID registry include the new catalogue entries. Empty task source directories are retained with ignored `.gitkeep` files so tooling is ready, but they contain no learner or production fixtures.

## Readiness and production content

No Wave 2 task is practice-ready, dispatched, or eligible for sessions. The production question bank remains the existing 41 learner items. Technical contract fixtures live only under tests. Expected production content version remains `sha256:246d400e68562495a7d492682ac53555994ef1b67266c4bd484078e70d4fde28`; existing item revisions and Attempts are unchanged.

## Verification

Official format facts and source URLs are recorded in [Wave 2 specification](../pte-spec/wave-2-2026-10.md). Details that need task-level re-verification are explicitly marked there. Automated checks are listed in the Activity 09.01 change record; no learner-facing Wave 2 feature is part of this step.
