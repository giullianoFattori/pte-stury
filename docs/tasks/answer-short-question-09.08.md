# Activity 09.08 — Answer Short Question

Implemented six local practice items with original short audio prompts, authored accepted answers, and a local Whisper recording flow.

## Task contract

- Pearson format represented here: Speaking & Writing section, Listening skill, 3–9 second audio prompt, immediate microphone opening after playback, and a response window up to 10 seconds.
- Matching is deterministic: NFKC, case and whitespace normalization, apostrophe normalization, terminal punctuation removal, one optional leading article, exact match or complete lexical phrase containment. No semantic matching, fuzzy spelling, or dynamic synonyms.
- Accepted answers are authored and limited to six words. A response over 12 words is flagged for feedback but receives the same item correctness if a complete accepted answer is present.
- An empty local Whisper result scores zero and can be saved as an omission. Wrong lexical answers create vocabulary errors; no pronunciation or fluency scoring is used.
- Short-answer STT can split or omit one-word responses. The exact local transcript is shown without correction.

## Content and implementation

Items: `asq-000001` through `asq-000006`. Prompt assets are local MP3 files synthesized from their matching `questionTranscript` with FFmpeg/Flite. Semantic validation enforces the 3–9 second duration, non-empty question, normalized answer uniqueness and answer length. Optional images require alt text and use existing image integrity checks.

The exercise requests microphone permission before Start, plays the prompt once, starts recording from the audio-ended event, supports manual stop and automatically stops at 10 seconds. Audio is sent only to the existing local `/api/v1/transcribe` Whisper runtime. Attempts store the transcript, 0/1 score, match evidence, response word count, local-processing evidence and recording duration. Incorrect or omitted answers create one retrieval review.

Standalone route: `/study/answer-short-question`. The task is enabled for Task Practice and Mixed Practice. Quick Practice remains WFD / RS / RA. Session summaries report correctness, accuracy, no-response and overlong counts; this is not an overall PTE Listening score.

Content schema v2 and Dexie v3 are unchanged. The feature does not certify microphone behavior on physical devices or human short-answer recognition quality.

## Validation

Validation completed for this implementation:

- Content validation/build/verification passed for 77 active items, 34 local audio assets and 4 local images. Existing duplicate-prompt/audio warnings in other task content remain warnings.
- `npm test`: 1,218 passed; `npm run lint` and `npm run build` passed.
- `npm run test:answer-short-question-browser` passed the standalone local prompt/record/save flow and Task Practice summary, including immediate post-audio recording, exact and contained phrase matching, empty no-speech saving, 10-second stop, and no external requests.
- `npm run test:mixed-practice-browser` and `npm run test:session-summary-browser` passed. Mixed Practice reports 16 ready task types and leaves the Quick Practice pool unchanged.
- `npm run package:test`: 7 passed. `npm run package:linux` passed runtime tests, the complete test suite, lint/build, package tests and the internal packaged-app smoke. The smoke verified all 6 ASQ items, their local audio, the standalone and session routes, and a successful local transcription. This is an internal host smoke, not clean-machine or Windows/macOS certification.
- `git diff --check` passed.
