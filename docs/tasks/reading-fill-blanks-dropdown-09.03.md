# Reading: Fill in the Blanks — Dropdown (Activity 09.03)

## Task contract

Verified 2026-11-01 against Pearson's current [PTE Academic Reading task format](https://www.pearsonpte.com/pte-academic/test-format/reading/) and [PTE Academic Score Guide](https://www.pearsonpte.com/content/dam/one-dot-com/one-dot-com/english/Support/PTE/pte-academic-score-guide.pdf): Reading skill; passage up to 200 words; no separate task timer; one dropdown choice per gap; +1 for a correct blank and 0 for an incorrect blank, with a minimum item score of zero. The learner receives partial credit across blanks.

## Implementation

- Five original academic reading passages (`rfbd-000001`–`rfbd-000005`), each with five stable blank IDs and four plausible options per gap. Reconstructed passage length is capped at 200 words by published-content validation.
- Native inline `<select>` controls use labels such as “Blank 1 of 5”, preserve keyboard behavior, and allow revisions until submission. Blank omissions are permitted and earn zero.
- The scorer compares the selected authored option string exactly. `Attempt.score` is `correctBlanks / totalBlanks`; raw and maximum points plus correct, incorrect, unanswered and exact-all-correct metrics are persisted in `Attempt.metrics`. `responseData.kind = 'blank-choice'` stores the complete blank-ID-to-option response map.
- Deterministic omission and wrong-option ErrorRecords are capped at six; linked contextual ReviewItems are capped at four.
- The task is available in standalone, Task Practice, and Mixed Practice. Quick remains WFD / RS / RA. The dedicated summary aggregates blank counts before calculating accuracy.
- No timer, audio, microphone, MediaRecorder, transcription runtime, or remote service is used.

## Content and compatibility

Question-bank schema remains v2 and Dexie remains v3. The bank now contains 51 active learner items, with five Dropdown items; existing foundation and Wave 1 item revisions are unchanged. Generated content version: `sha256:1f10e3706044279f1d6e6188508cb853ce945a3ce13f5a0b5c55cdf2b560b8fa`.

## Validation evidence

Recorded by the Activity 09.03 implementation run (2026-11-01):

- `content:validate`, `content:build`, `content:verify`, audio verification, and image verification: PASS. The repeated generated build retained the same content version.
- `npm test`: 1,181 PASS; `npm run build`: PASS; `npm run lint`: PASS; `npm run package:test`: 7 PASS; `git diff --check`: PASS.
- Dropdown browser: PASS for standalone partial scoring and response persistence, Task Practice with five items and its summary, plus a five-question Mixed session transitioning from Listening Type In to Dropdown. Browser 154.0.8037.97; zero page errors, unexpected remote requests, microphone calls, or MediaRecorder instances.
- Listening Type In browser regression: PASS; Mixed Practice browser regression: PASS with 11 ready tasks and Max capacity 51; session summary browser regression: PASS with stable reload.
- `npm run package:linux`: PASS. The current Linux x64 package internal host smoke verified 11 standalone routes, Task/session routes, 51 learner items, five Dropdown items, 28 local audio assets, four local images, launcher lifecycle, and package restart/shutdown checks. Dropdown standalone and session paths passed. This is host technical evidence; it does not certify clean-machine, Windows/macOS, signing, or human speech quality.

## Limits

The app reports deterministic item-level practice points, not an official PTE Reading section score. Options are scored exactly as authored; semantic alternatives and fuzzy matching are not accepted.
