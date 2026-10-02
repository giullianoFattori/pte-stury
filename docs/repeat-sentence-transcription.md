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
pronunciation or fluency evidence. No comparison, scoring or persistence is added.

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
4. Assess whether recognition is good enough before implementing content scoring.
   If the target remains unsupported, choose a different local adapter as a
   separate decision; do not silently relax the privacy contract.

| Spoken recording | Detected text | Assessment |
| --- | --- | --- |
| Students must arrive before nine tomorrow. | Pending real-engine test | Pending |
| Students must arrive nine tomorrow. | Pending real-engine test | Pending |
| Students must arrive after nine tomorrow. | Pending real-engine test | Pending |
| Quiet / unclear speech | Pending real-engine test | Pending |
