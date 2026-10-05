# Read Aloud — Step 08: final integration validation

Validated on 2026-10-05 against Step 07, plus a small content-result wording fix.
**Automated integration gate: passed. Activity 04 closure: pending live voice/local
STT validation.** The learner subsequently confirmed real recording works in
both RA and RS, but local availability fails in Chrome and Edge. Actual recorded-
audio local transcription remains unvalidated; Activity 04 is not marked COMPLETE.
See [Local transcription support](local-transcription-support.md) for the language
selection, capability diagnostics and default-model correction added after this gate.

Follow-up native probes on Pop!_OS 24.04 with Chrome 154.0.8037.97 found en-AU
and en-US downloadable with default options, while the previously forced
`quality: 'dictation'` reported unavailable. Availability/installation now match
the default quality already used by recognition. Both RA and RS show Install
local speech pack in the actual Chrome UI. No real model installation or
transcription was attempted; Edge 154 remains unavailable in the tested profile.
The original environment table below records the earlier Edge validation.

## Actual browser environment

| Capability | Observed result |
| --- | --- |
| Browser | Microsoft Edge 154.0.4258.53, Linux, headless, localhost |
| Test storage | Disposable `pte-ra08-edge` profile; separate from learner history |
| MediaRecorder | Native; audio/webm with Opus supported; nonempty recorded Blobs |
| Playback | Native audio controls; playback time advances for the current Blob |
| Web Audio | Native decoding and closed AudioContexts |
| Recorded-audio captureStream | Present |
| Native local STT, en-AU | `unavailable`, verified again after removing adapter mocks |
| Native language pack | No installation attempted because availability was unavailable |
| Complete native voice → STT flow | Not available in this environment |
| Controlled integration flow | Passed using synthetic audio and injected local-adapter transcripts |

Synthetic oscillator/gain recordings exercise the real MediaRecorder, Blob,
playback, Web Audio decoder and segmentation pipeline. They are not human speech.
Microphone allow/deny/no-device/late-permission states use controlled getUserMedia
responses and real stream tracks; they do not establish physical microphone
permission, speaker audibility or the browser microphone indicator's appearance.
Language-pack UI was exercised with a controlled downloadable/available adapter;
installation was invoked only by the explicit Install button. No real pack was
silently downloaded and no remote transcription fallback was used.

## Passed checks

| Area | Evidence |
| --- | --- |
| Content bank/navigation | Fresh profile seeds 17 items: 5 WFD, 6 RS, 6 RA. RA cycles 1 → 6 → 1 with correct passage/difficulty. Refresh leaves 17 items. |
| Preview/training | Recording disabled before preview; canonical text unchanged. Phrase boundaries reconstruct all six passages; emphasis matches configured stress words. Combined aids contain no duplicated words. Next resets preview/aids. |
| Microphone/recording | Controlled denied/unavailable states recover to ready; preview still gates Start. Next/Disable blocked during recording. Native recorder becomes inactive on Stop and supplies nonempty current audio. |
| Playback/re-record | Current audio plays and time advances. Re-record revokes the previous URL and clears transcript/content/segmentation/timing/save state while keeping preview complete. |
| STT independence/local-only | Native unavailable state still allows timing without WPM; Save stays blocked. Controlled successful STT receives the identical recorded Blob. Nonlocal result cannot enable Save. |
| Empty/silent input | No-speech error and punctuation-only transcript do not produce content results or enable Save. Silent waveform produces no continuous speech and no rate/judgement. |
| Content | Case/punctuation-only variation is exact. Omission, insertion, substitution and two omissions plus substitution persist expected mismatch counts. Unit tests additionally cover word order and repeated tokens. |
| Timing | Continuous activity, two one-second interior pauses, approximately two-second leading/trailing delays and silence are handled. Interior pause counts exclude edge silence. WPM is detected words / active-window minutes. |
| Dimension independence | Perfect transcript with two long pauses remains score 1 and creates no errors/review. Smooth timing with one omitted word creates one content error and one review. |
| Persistence | Explicit Save, finite aggregate-only snapshots, recorder versus decoded duration, actual long-pause threshold and local metadata retained. No Blob/URL/PCM/frame/segment/feedback-string payloads. |
| Errors/reviews | Reading/speaking, severity 1, detected/not-detected wording, positions, correct Attempt/StudyItem links. Exactly one sentence review per imperfect attempt; no sourceErrorId; dueAt +24h and initial counters. |
| Atomicity/recovery | Browser-only failure in reviews.bulkAdd after Attempt and Error insertions rolls back both, leaving all three tables unchanged. Save retries without re-recording. |
| Duplicate save | Two synchronous activations during a delayed save produce one outcome. Response-changing controls remain disabled. |
| Retry/history | Same passage, microphone, completed preview and both enabled aids retained; all response/result/save state cleared. Perfect retry leaves earlier errors/review untouched; distinct Attempt UUIDs. |
| Refresh | All primary-run Attempts, Errors and Reviews survive reload; transient playback/audio disappears. |
| Cleanup/races | SPA navigation stops tracks and active MediaRecorder, revokes URLs and aborts pending STT. Late STT results do not appear on return. Pending decode closes its context and is ignored after navigation. Late permission resolves into stopped tracks, not stale ready state. |
| WFD/RS regression | WFD perfect/imperfect outcomes add 2 Attempts, 1 Error, 1 Review; RS imperfect recording/STT/content/save/retry and resource cleanup pass. |
| Privacy | Follow-up full RA + WFD + RS run observed 85 same-origin HTTP GET requests, no request bodies or learner-data uploads, no unhandled exceptions or app console errors. Source audit finds no remote learner-data transport. |

The primary RA sequence persisted six Attempts, six content ErrorRecords and four
passage reviews: perfect, omission, perfect retry with timing weakness, insertion,
substitution and three mismatches. A subsequent clean full-flow regression added
another perfect RA Attempt without errors/review. Prior history stayed intact.
Temporary rollback/delay/permission/STT instrumentation existed only in external
browser scripts. The expected forced-save error was distinguished from ordinary
app console errors. No forced failure or test-only constant was added to source.

## Architecture and cleanup

- `domain/scoring` and `domain/audio-analysis` use plain data and deterministic
  algorithms; no React, Dexie or DOM/browser imports. Segmentation is not repeated
  by the fluency calculator.
- Browser decoding remains in infrastructure; microphone/recording/transcription
  remain shared under `src/shared/speech`, without RA depending on RS internals.
- RA writes through the existing atomic outcome repository. Timing stays inside
  Attempt metrics; there are no pronunciation/fluency/stress error labels or
  invented scores. Dexie remains version 2, with no schema/dependency change.
- Segmentation debug remains secondary/collapsible. Content copy now says it
  measures text reproduction only and pronunciation is unmeasured, replacing the
  stale Step 03 statement that conflicted with measured timing feedback.
- `npm test`: 159 tests passed. `npm run build`, `npm run lint` and whitespace checks
  passed. Temporary scripts removed and validation processes stopped.

## Remaining live validation before Activity 04 closure

Use a browser/device that actually reports local en-AU transcription available
(or downloadable, with an explicit language-pack installation). Keep processing
local; do not bypass capability checks with a cloud recognizer.

1. Record a real passage and listen to playback. Confirm microphone permission,
   audible latest audio and disappearance of the microphone indicator after
   disabling/navigating away.
2. Transcribe the actual recording locally. Compare detected words with playback;
   confirm recognizer accuracy and distinguish recognizer errors from alignment.
3. Read with deliberate long pauses and two-second start/end delays; then record
   silence and softer speech. Compare segmentation/timing against actual playback
   to assess real microphone gain/noise and voice behaviour.
4. Save an omission, retry perfectly, refresh and confirm both Attempts and the
   first review remain. Record browser/version and actual local-pack capability.

Until these checks are reported, the native speaking quality gate and Activity 04
closure remain pending. No next major roadmap activity is selected in this step.
Pronunciation, lexical stress, prosody, official scoring, calibrated mastery,
exam timers and word-to-audio phrase alignment remain intentional future work.
