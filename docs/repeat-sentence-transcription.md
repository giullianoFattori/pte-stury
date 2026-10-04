# Repeat Sentence: local transcription validation

## Contract and privacy

The feature depends on `SpeechToTextAdapter`. The browser adapter requires local
recognition, local availability/install APIs and audio-element `captureStream()`.
Every availability/install request uses `processLocally: true`, `quality: 'dictation'`
and `en-AU`. Recognition always uses `processLocally = true` and receives the audio
track captured from the exact recorded Blob. It never retries without a track,
switches to live-microphone recognition, or falls back to a remote engine.

Availability is checked explicitly. A language pack downloads only after the
learner clicks Install. The browser controls the pack download; the app does not
upload audio. Recording, transcription and object URLs remain transient.

Recognition starts before silent playback begins, to avoid losing the beginning
of the sentence during engine startup. End-of-playback requests final results.
Error, cancellation, timeout and completion release the recognizer, captured
tracks, temporary audio source and object URL. Reset/unmount invalidate pending
results so they cannot appear under another recording or question.

These experimental APIs have limited support. A browser must implement the
`start(audioTrack)` overload; the adapter reports audio-track failures rather
than retrying against another source. STT confidence is recognizer metadata, not
pronunciation or fluency evidence. The adapter itself performs no comparison,
scoring or persistence; those belong to the domain and feature layers.

References: [local processing](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally),
[availability](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static),
[audio-track input](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start).

## Local-browser check — 2026-10-02

Environment: Firefox 155.0.1, Linux, same-origin Vite on localhost, headless test
profile with synthetic microphone. No experimental speech flags were enabled.

| Check | Observed |
| --- | --- |
| SpeechRecognition constructor | Absent |
| Local processing / availability / installation | Unsupported |
| Audio `captureStream()` | Present |
| en-AU language-pack state | Cannot query: local APIs absent |
| Real transcription | Not possible in this environment |
| Recognition quality for learner's voice | Not assessed |
| Recording while STT unavailable | Native recording and playback remain available |

An injected recognizer was also tested with an actual browser recording and
native captured audio track. It validated explicit installation, mandatory local
settings, detected-text UI, re-record reset and cancellation/stale-result handling
on Next. **Injected transcripts are not evidence of real speech recognition.**
Node tests cover availability states, privacy options, Blob/track identity,
error translation, empty speech, cancellation and resource cleanup. Run `npm test`.

## Remaining quality gate

Step 04's real-recognition quality gate is **not complete**. On the target browser:

1. Open `/study/repeat-sentence`, check local availability and explicitly install
   the en-AU dictation pack if downloadable. If unsupported/unavailable, stop here;
   no audio is sent to a cloud service.
2. Use a physical microphone and transcribe an exact sentence, then an omission,
   substitution and quiet recording. Record spoken versus detected text below.
3. Re-record and move to the next question during transcription. Confirm stale
   text disappears and microphone/playback resources behave normally.
4. Assess whether recognition is good enough for learner use. Deterministic content
   scoring is already implemented, but depends on the quality of detected text.
   If the target remains unsupported, choose a different local adapter as a
   separate decision; do not silently relax the privacy contract.

| Spoken recording | Detected text | Assessment |
| --- | --- | --- |
| Students must arrive before nine tomorrow. | Pending real-engine test | Pending |
| Students must arrive nine tomorrow. | Pending real-engine test | Pending |
| Students must arrive after nine tomorrow. | Pending real-engine test | Pending |
| Quiet / unclear speech | Pending real-engine test | Pending |

## Step 05: deterministic content integration — 2026-10-03

The Step 04 implementation is committed and pushed. Its real-recognition quality
gate above remains pending; Step 05 does not alter or replace the recognizer.

RS now uses the same pure normalization/tokenization/alignment implementation as
WFD, with separate RS metrics. V1 content recall and sequence accuracy both count
globally aligned correct expected positions. Extras remain separate and defeat
exact content match, without subtracting expected-word recall twice.

Chunk metadata must reproduce the expected normalized token sequence exactly.
Each chunk is credited by its expected positions in the full alignment, not by
independent substring matching. A chunk is retained only at 100% expected-word
recall. Invalid/absent chunk metadata displays a controlled fallback while valid
word feedback remains available. Missing expected text produces no content score.

Validation: build and lint passed, and all 83 Node tests passed, including WFD
regressions. Firefox integration used native recording/captured tracks with an
injected recognizer supplying controlled transcripts. Exact, omission,
substitution, insertion, reordered words, re-record, Next, empty recognition,
invalid chunk metadata and missing expected text behaved as specified. No new
Attempt, ErrorRecord or ReviewItem was persisted; no unexpected console errors
were observed. This is validation of content logic/UI, not real STT quality.

## Step 06: Attempt persistence — 2026-10-03

Saving is explicit after successful local transcription and valid content
comparison. `buildRepeatSentenceAttempt()` maps detected text, recording duration,
normalized content recall, sequence metrics, error counts/rates, chunk totals and
recognizer confidence/local-processing metadata into a detached Attempt snapshot.
No Blob, object URL, microphone stream or recorded chunks enter the repository.
The repository uses `add`, never upsert. RS saves no ErrorRecords or ReviewItems
in this step. WFD's existing atomic outcome pipeline is unchanged.

V1 fallback: unavailable chunk analysis has zero chunk metrics and `totalChunks = 0`,
which must not be interpreted as failure to retain known chunks. Absent STT
confidence uses the requested v1 zero fallback, not a pronunciation measurement.

A synchronous save lock and saved-ID guard prevent duplicate saves. Re-record,
Next, microphone disable and replacement transcription reset saved/error state;
controls that can change the result are blocked while a save is pending. A failed
save retains recording, transcript and feedback for retry. Navigation does not
cancel an already-requested historical write, but late completion does not update
an unmounted page.

Validation: build, lint and all 89 Node tests passed. In the Firefox test profile,
native recording plus a controlled recognizer saved real IndexedDB Attempts for
perfect content, omission, insertion and unavailable chunk analysis. Recording
duration reflected a roughly five-second recording. Rapid double-click and a
delayed repository call produced one Attempt; an injected save failure preserved
the result and retry succeeded. Multiple Attempts had independent IDs/timestamps.
Re-record/Next cleared saved state, and history survived refresh. RS added no
errors/reviews. A perfect WFD submission also persisted successfully.

These database checks used controlled transcripts, not a working native speech
recognizer. The real-recognition quality gate above remains pending.

## Step 08: final integration validation — 2026-10-04

Status: deterministic flow and persistence validated; real speech quality and
physical-microphone listening checks remain pending. Activity 03 is not yet fully
closed. This validation does not reproduce Pearson's proprietary speaking engine.

Environment: Microsoft Edge 154.0.0.0 on Linux, headless isolated development
profile, Vite at localhost. The profile contains disposable test history only.
Native `SpeechRecognition`, `processLocally`, `available`, `install` and audio
`captureStream()` exist, but the unmodified adapter returned **unavailable** for
the local `en-AU` dictation pack. No pack installation was triggered and no remote
recognition fallback was used. Real detected-text accuracy could not be measured.

Browser integration therefore injected controlled adapter transcripts and
permission errors. An oscillator supplied a native MediaStream; recording used
native MediaRecorder, real nonempty Blobs, native audio decoding/playback and
real Dexie/IndexedDB transactions. These tests establish software behavior, not
recognition accuracy, physical microphone permission or subjective audibility.

| Validation | Evidence / result |
| --- | --- |
| Six questions | Cycled 1 → 2 → 3 → 4 → 5 → 6 → 1; matching local MP3, play/replay, no autoplay, no early transcript/chunk display |
| Permission states | Injected NotAllowedError displayed denied; NotFoundError displayed unavailable; native synthetic stream became ready |
| Recording | Nonempty Blob, positive duration, native playback time advanced, recorder became inactive after Stop |
| Overlap | Source playing disables Start; recording disables source playback and Next; replay during retry remains guarded |
| Reset/navigation | Record again revoked the previous URL; retry/Next cleared recording, transcript, feedback and save state; microphone stayed ready |
| Content/chunks | Node coverage passes for normalization, exact content, omission, insertion, substitution, reordered words and all six chunk definitions |
| No speech | Injected no-speech produced a controlled error with no score or Save; adapter tests cover empty final text and cleanup |
| Outcomes | Perfect +1/0/0; omission +1/1/1; two omissions plus one substitution +1/3/1 (Attempt/Error/Review deltas) |
| Atomic rollback | Browser-only wrapper threw inside review bulkAdd after writes; all three tables stayed empty; restored immediately, retry saved successfully |
| Duplicate protection | Rapid double-click during a delayed save and repeated Save after success created one outcome; controls stayed blocked during save; synchronous locks remain unchanged |
| Acceptance sequence | Perfect A, omission B, perfect retry B produced +3 Attempts/+1 Error/+1 Review; B's review remained |
| Relationships/schedule | All RS errors/reviews linked to existing attempts/items; severity 1, listening+speaking, sentence review without sourceErrorId; initial delay exactly 24 hours |
| History/privacy | Distinct attempt IDs, bounded content metrics, processedLocally true, only allowed Attempt fields; history survived reload; no Blob/URL/stream/chunks persisted |
| Resource cleanup | Leaving during native recording stopped all microphone tracks and recorders; object URL revocation checked on reset; adapter tests cover captured-track/recognizer/audio release |
| WFD regression | Perfect and omission submissions added two Attempts, one Error and one linked Review in IndexedDB |
| Network | Observed app requests were same-origin GETs; no remote requests or audio/transcript/metric uploads |
| Architecture | Scoring imports no React, Dexie or browser APIs; STT uses SpeechToTextAdapter; React saves through studyOutcomeRepository |

One integration bug was reproduced and fixed: clicking Retry while source audio
was playing reset the parent's playing flag even though the audio kept playing.
Retry now preserves that flag until the actual audio pauses/ends. Start remains
disabled during playback. Regression steps: save an outcome, replay the source,
click Retry during playback, verify Start stays disabled, then pause/end playback
and verify Start becomes available with the same question and microphone.

`npm run build`, `npm run lint`, `npm test` and `git diff --check` passed.
No database schema/version change, forced failure, injected adapter or browser
test hook was added to application source. Browser validation scripts stayed
outside the repository and were removed after use.

### Remaining closure checks

On a browser/device whose native local `en-AU` adapter reports available (or
downloadable followed by an explicit Install action), complete the real-engine
table above with a physical microphone. Listen to source and learner playback,
test silence, confirm actual microphone permission/indicator cleanup, and verify
recognition of exact, omitted and substituted speech. Until those checks pass,
full Activity 03 completion and real speech quality remain unverified. The app
continues to report unsupported/unavailable states without uploading recordings.
