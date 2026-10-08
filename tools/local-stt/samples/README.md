# Real learner corpus — pending

Store private recordings and manual spoken references under `private/` (gitignored)
or outside the repository. Do not put learner recordings in this tracked directory.

Required cases: RA easy (`ra-001`), RA academic (`ra-005`), RS short (`rs-001`),
RS medium (`rs-003`), and RS long (`rs-005`). For each, listen to the learner audio
and transcribe what was actually spoken. The expected PTE passage is separate.

Record the file's provenance, browser, MIME type, manually verified reference, model,
raw transcript, words, S/D/I, WER, missing/inserted/substituted words, audio duration,
inference time and RTF. Compare the same recordings across models in Activity 05.
Do not send references or expected passages to the decoder as prompts.

Current user recordings are browser Blobs only; no real corpus was supplied for
Step 04.9. Controlled synthetic tests are documented separately in ../RESULTS.md.
