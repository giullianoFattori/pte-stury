# Activity 09.10 — Listening Multiple Choice — Multiple Answers

Five published items use local audio between 80 and 120 seconds, authored transcripts and stable option IDs. The learner sees the question and options during a seven-second preparation period; playback starts automatically and is offered once. There is no separate answer timer. The transcript is revealed after submission. The task assesses Listening only.

The shared multiple-choice scorer awards +1 per correct selection, −1 per incorrect selection and floors item points at zero. Attempts store canonical selected IDs in `responseData.kind = 'multiple-choice'`, normalized score, selection counts, precision, recall and evidence that source playback started. Session summaries aggregate counts before calculating precision and recall; they are not overall PTE Listening scores. Incorrect selections and omissions create bounded errors and reviews.

## Validation

On 2026-11-15, content validation, generation and audio/image integrity checks passed. The Linux packaging pipeline passed 1,227 tests, build, lint, seven package tests and its launcher smoke. The standalone and Task Practice browser flow passed with controlled audio events, including preparation, one playback, persistence and summary. Mixed Practice browser validation passed with 18 ready tasks and 87 items. Existing Reading MC Multiple, Listening Fill Blanks, Task Practice and session-summary browser regressions passed. The packaged launcher browser smoke passed with zero page errors, external requests and transcription requests; evidence is in `audits/listening-multiple-choice-multiple-09.10-package-browser.json`. Production audio integrity and duration were verified separately from controlled browser playback.

The audio is locally synthesized from authored transcripts adapted from the Reading MC Multiple passages; it has not been assessed for naturalness or learner suitability. Manual listening review remains outstanding. The package smoke is an internal Linux host check, not clean-machine, Windows or macOS certification. Quick Practice remains WFD / RS / RA; content schema v2 and Dexie v3 remain unchanged.
