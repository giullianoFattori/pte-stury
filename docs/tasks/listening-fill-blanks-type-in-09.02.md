# Listening: Fill in the Blanks — Type In (Activity 09.02)

**Status:** Implemented  
**Format verified:** 2026-11-01  
**Question-bank schema:** v2  
**Dexie:** v3

## Official task format

The current [Pearson Listening task-format page](https://www.pearsonpte.com/pte-academic/test-format/listening/) describes one audio playback, a transcript with gaps, and typed missing words. It provides approximately seven seconds to skim before playback and awards one point for each correctly spelled word. The [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf) is the project source of truth for communicative skills and specifies Listening for this task; Pearson's task page contains inconsistent wording that mentions Listening + Writing. Typing is the response modality, not a second communicative-skill mapping.

Production audio is constrained to 30–60 seconds by published content validation. The learner starts a practice item explicitly, sees the transcript for a 7-second skim, and then the local audio starts once. Inputs unlock as playback begins and remain editable after audio ends. Submission is explicit; there is no separate item timer and no replay before submission. Retry resets the whole practice attempt and allows a new playback.

## Content and scoring

Five original academic-style items (`lfb-000001` through `lfb-000005`) use local audio and four authored blanks each. Audio was synthesized locally with the packaged Flite `slt` voice for deterministic offline assets. It is a synthetic voice and has not been evaluated for Pearson-like or human speech quality.

Each blank is identified by its authored stable ID. The task scorer trims surrounding whitespace, applies Unicode NFC normalization, and compares case-insensitively. It does not stem, correct spelling, accept synonyms, or use fuzzy matching. Punctuation, apostrophes, hyphens, inflections, and spelling remain significant. Each exact blank earns one point; incorrect and unanswered blanks earn zero. `Attempt.score` is `correctBlanks / totalBlanks`; raw `correctBlanks` and `totalBlanks` are also persisted. This is item-level practice scoring, not a Listening section score.

The Attempt stores answers in the existing backward-compatible structure:

```ts
{ kind: 'blank-text', answers: Record<string, string> }
```

Every authored blank ID is persisted, including unanswered blanks as an empty string. Builder validation rejects unknown IDs, missing IDs, non-string answers, and invalid duration. Error categorization may identify a likely one-edit spelling miss for feedback only; it never changes score. Errors and contextual ReviewItems are bounded at six and four per Attempt.

## Session integration

The task is practice-ready through standalone practice, Task Practice, and Mixed Practice. Quick Practice remains WFD / RS / RA. Session persistence uses the existing atomic exercise persistence hook. The task summary pools blank counts before calculating accuracy and fails closed if Attempt counts or normalized score are inconsistent.

## Validation evidence

- Content schema v2; five production learner items; 46 total learner items; all 5 new items have four blanks.
- Generated content version: `sha256:e46ab162d29390ed44433c003165407db304c71c94b2a58bfc4d7a7229e90c2c`.
- Local audio integrity/decode and 30–60 second duration checks pass.
- Task browser flow passes: seven-second skim, one playback, Task Practice with five questions, structured response save, and session summary.
- Browser evidence: Chromium 154.0.8037.97; 0 microphone requests, 0 MediaRecorder instances, 0 page errors, 0 unexpected remote requests.
- Ten-task Mixed browser flow and session-summary browser suite pass; Dexie remains v3.
- `npm test`: 1,175 passed; `npm run build`, `npm run lint`, and all 7 package tests pass.
- `npm run package:linux`: PASS; extracted package smoke confirms all 10 standalone routes, five LFB items, and checksum-matching local audio. The package smoke also confirms the local Whisper technical path. This is an internal host check, not clean-machine or cross-platform certification.
- Linux internal package archive SHA-256: `1a8922ff020e4f70e3e98c05e5f916c1adff5a0413c71296758df2cf32cae847`.

These checks are technical evidence, not speech-quality evidence. The content pipeline emits pre-existing duplicate-prompt/audio-reuse warnings for older items; it reports no validation errors.

## Limitations

- This reproduces the published per-word item rule only; it does not calculate an official PTE Listening score.
- Capitalization is ignored locally, while spelling and authored word form must match exactly.
- Spelling error categorization is a local diagnostic heuristic, not a fuzzy scorer.
- Audio uses local synthetic speech; human speech quality/benchmarking remains outside this step.
- No microphone, learner transcription, cloud service, or remote content is used.
