# Summarize Written Text — Activity 08.05

Verified 2026-10-24 against Pearson's current [PTE Academic format page](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/) and the current [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/PTE-Academic-Test-Taker-Score-Guide.pdf). Pearson defines Summarize Written Text as Reading + Writing: read a passage up to 300 words, then write one single complete sentence in 10 minutes. The Score Guide's Form rules give zero for fewer than five or more than 75 words, multiple sentences, or all-capitals text. Scored traits are Content, Form, Grammar and Vocabulary. `PTE_SPEC_VERSION` remains `2026-10-01`.

## Exercise and content

Four original internally authored passages are included, covering environment, education, technology and public policy/economics. Each passage is 180–300 words, has authored key points and an illustrative reference summary. Reference summaries are revealed only after submission and are never treated as the only correct answer. The reading passage, response and optional notes remain local. Notes are transient and are neither persisted nor scored.

The timer begins only after **Start question**. It measures 600,000 ms from a monotonic start time. At timeout, the editor locks, the current response remains visible, and saving is an explicit action. Retrying resets response, notes and timer. No unsaved draft is persisted.

## Local practice metrics

The canonical word counter trims and splits on Unicode whitespace, ignores punctuation-only chunks, and treats internal hyphens and apostrophes as part of one word. The same helper powers the editor, Form checks and Attempt metrics.

The Form estimate checks 5–75 words inclusive, one detected sentence boundary and not all capitals. Decimal points and a small common-abbreviation list are excluded from boundary counts. Capitalization and terminal punctuation are shown as separate diagnostics. This is a deterministic estimate; it cannot judge whether a response is a linguistically complete sentence as Pearson does.

Key-point evidence uses the shared lexical matcher, not exact comparison with the reference summary. The match threshold and small stop-word list are shared with other Wave 1 tasks. This is lexical evidence and does not establish semantic paraphrase or reproduce Pearson Content scoring.

Copy diagnostics report response-token overlap with the source passage and the longest contiguous copied run. They can flag useful academic terms and are advisory only. Compression ratio is response words divided by passage words. No Grammar or Vocabulary score is claimed.

`Attempt.score` is exactly `formValid ? keyPointCoverage : 0`, normalized from 0 to 1. It is an internal practice metric only, not an official Pearson SWT score. Attempts retain the learner response, item revision, elapsed duration, Form booleans, key-point evidence, source-copy estimates, passage length and compression ratio. Deterministic Form/key-point/copy issues create bounded Errors and up to three prioritized ReviewItems.

## Sessions and persistence

SWT is practice-ready for standalone, Task Practice and Mixed Practice. The Task Practice capacity is read from IndexedDB; four items enable 3 and Max and disable 5. Mixed Practice uses the existing task allocation and interleaving behavior. Quick Practice remains WFD / RS / RA.

Session summaries report valid Form count, average word count, average key-point coverage, pooled matched/total key points and average direct-copy estimate. They do not report official-looking Grammar or Vocabulary averages. The global session disclaimer continues to identify these as practice metrics.

Question-bank schema remains v2 and Dexie remains v3. The active bank now contains 32 items: 17 foundation, 4 Retell Lecture, 3 Summarize Group Discussion, 4 Describe Image and 4 Summarize Written Text. Existing foundation item revisions are unchanged. SWT is independent of the local speech runtime and makes no speech API requests.

## Validation evidence

Unit tests cover the word-count boundaries and Unicode semantics, sentence estimation, key-point evidence, copied-run diagnostics, attempt integrity, bounded errors/reviews, timer behavior and session summary aggregation. The full application/runtime suite passes (1,136 tests), the production build and lint pass, and all seven package tests pass. The SWT Linux Chrome browser test uses the real application and IndexedDB with fake time; it verifies invalid and valid standalone submissions, timeout response retention, Task Practice capacity and summary, and zero speech-runtime requests. Mixed allocation tests cover Describe Image + SWT selection and deterministic queue building; the separate Describe Image browser suite validates its speech workflow. Browser runs report zero page errors and zero unexpected remote requests. The Linux internal package build and smoke script completed with the SWT static route allowlisted. This is host package evidence, not clean-machine, signing or cross-platform certification.

## Limits

Pearson Content, Grammar and Vocabulary scoring are not reproduced. Sentence completeness and lexical paraphrase are approximate local checks. There is no grammar engine or cloud scoring. Human evaluator equivalence is not claimed; human benchmarking and physical microphone certification remain Activity 05 gates.
