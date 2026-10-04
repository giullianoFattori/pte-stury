# Read Aloud — Step 03: local transcription and content accuracy

Implemented on 2026-10-05. RA and RS share `useSpeechTranscription` and
`TranscriptionPanel` under `src/shared/speech`. The hook accepts optional
`language` and `adapter` options; its default is the existing on-device browser
adapter with `DEFAULT_TRANSCRIPTION_LANGUAGE = 'en-AU'`. Busy locks, cancellation,
stale-result protection and explicit pack installation remain in the shared hook.

RA derives comparison from successful detected text and the current passage.
Re-record, recording start, Next and microphone disable reset transcription and
invalidate pending work. Re-record retains preview and training aids; Next resets
them. Passage and aids remain available alongside detected speech and feedback.
Empty expected/detected tokens produce an error rather than a displayed score.

## Assessment contract

`compareReadAloud` reuses shared normalization, tokenization and order-sensitive
alignment. It retains raw text, normalized text, token positions and mismatch
counts. RA has its own metric contract:

```text
textCoverage = aligned correct expected words / expected words
omissionRate = missing / expected words
insertionRate = extra / expected words
substitutionRate = substitutions / expected words
```

Rates with zero expected words return zero. Display coverage is rounded to two
decimal places; normalized coverage remains unrounded. Extras can preserve full
coverage while defeating exact text match. Error rates, especially insertion
rate, can exceed one; they are counts per expected word, not probabilities.
Exact text match requires nonempty expected text and zero mismatches.

The UI calls coverage **Text accuracy** and identifies it as an internal content
metric. Recognizer errors may affect feedback. No pronunciation, stress, fluency,
pause or speech-rate assessment is inferred from transcript accuracy. RA creates
no Attempt, ErrorRecord or ReviewItem in this step.

## Validation

Build, lint, all thirteen test files and diff whitespace checks passed. New RA
domain tests cover exact/case/punctuation/whitespace, omission, insertion,
substitution, word order, repeated words, empty inputs, immutable deterministic
metrics and all six starter passages. Existing RS/WFD tests also passed.

Browser integration used Edge 154 headless, localhost and an isolated disposable
profile. The unmodified browser adapter reported native local `en-AU` capability
as **unavailable**. No native pack installation or real recognition-quality test
was possible in this state. No fallback engine was introduced.

For integration, a controlled recognizer supplied transcripts while the actual
browser adapter consumed native recorded Blobs and captured native audio tracks:

- Unsupported, unavailable, downloading, downloadable and available states
  behaved correctly; installation occurred only after clicking Install.
- Availability/install options stayed local and used `en-AU`; recognition required
  `processLocally = true` and a recording track distinct from the microphone.
- Transcription received the exact playback recording Blob. Captured tracks
  stopped and temporary transcription URLs were revoked afterward.
- Exact/case/punctuation yielded 100% coverage; omission lowered it; insertion
  retained 100% but defeated exact match; substitution displayed both words.
- Empty recognition produced a controlled no-speech error with no content result.
- Re-record/Next during recognition cancelled work and prevented stale results.
- Detected speech, passage and training aids remained available with feedback.
- RA practice left all historical outcome payloads unchanged.
- RS availability/install, recording, transcription, feedback, atomic save and
  retry passed. An imperfect review remained after a perfect retry.
- Observed app requests were same-origin GETs; no audio/transcript uploads or
  remote transcription requests occurred.

Browser instrumentation was kept outside the repository and removed after use.
Injected recognizer output proves integration behavior, not actual STT accuracy.

## Remaining real-engine check

On a device with available local `en-AU` recognition, listen to learner playback
and compare it with detected text for exact, omitted, inserted, substituted and
quiet readings. If a pack is downloadable, install it explicitly. Distinguish
recognizer mistakes from alignment errors without changing scoring to hide STT
errors. Physical-microphone audibility and real-recognition quality remain
unverified in the headless environment; unavailable/unsupported capability is
reported without uploading recordings.
