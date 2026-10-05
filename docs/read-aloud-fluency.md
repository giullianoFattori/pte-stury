# Read Aloud — Step 05: timing metrics and feedback

Implemented on 2026-10-05. Timing consumes Step 04's segmentation result without
decoding or segmenting the waveform again. Content and timing remain separate
results, with no combined score, ideal WPM target or speed reward. All RA results
remain transient; no Attempt, ErrorRecord, ReviewItem, schema or dependency change
is introduced.

## Metric contract

| Metric | Definition |
| --- | --- |
| Recording duration | Decoded segmentation duration |
| Response latency | First speech start |
| Ending silence | Recording duration minus last speech end |
| Active window | First speech start to last speech end |
| Speech duration | Sum of meaningful speech segment durations |
| Interior pause duration | Sum of reported pause segments wholly inside the active window |
| Pause count / average / longest | Reported interior pauses only |
| Long-pause count | Interior pauses at least configurable `longPauseMs` (default 500) |
| Speech ratio | Speech duration / active window, clamped to 0…1 |
| Speech rate | Detected word count / active window in minutes, including interior pauses |

Leading and trailing silence never contribute to pause count, average, longest
pause or WPM's denominator. Ratios remain unrounded; display percentage rounds to
two decimal places. Boundary comparisons tolerate 0.000001 ms floating-point
differences. Invalid/nonfinite timing, configuration or word counts fail with a
RangeError instead of returning invalid numeric metrics.

Word count is optional. RA supplies it only for a successful transcript with
usable tokens, using the existing tokenizer. No usable transcript means absent
`detectedWordCount`/`speechRateWpm`, displayed as **Unavailable** when activity
exists. Explicit zero is supported by the pure API and differs from absent count.
With no speech, active metrics are zero, `hasSpeech` is false and WPM is absent,
even when a recognizer supplied text. Latency/ending silence are zero sentinels in
that case because no speech boundary was observed; the UI shows no reading judgement.

Step 04 omits subminimum interior gaps from pause reports while retaining their
frame labels. Therefore interior pause duration need not equal active window
minus speech duration. Speech ratio still reflects that unreported silence. This
step does not fabricate additional pause segments or change segmentation settings.

## Feedback and presentation

**Fluency timing** is the primary timing view; segmentation details remain closed
and secondary. Duration, continuity and pauses remain available without STT.
Either **Analyse → Transcribe** or **Transcribe → Analyse** updates WPM automatically.
Failed/empty replacement transcription removes WPM while retaining timing.

Feedback heuristics are centralized and configurable: several long pauses defaults
to two; low speech ratio defaults to below 0.70. The 500 ms long-pause definition
is experimental, not an official penalty criterion. Messages describe observations
and suggest phrase practice without assigning pauses to particular passage words.
Pronunciation and stress remain unmeasured. The UI states that timing feedback is
an internal practice measure, not an official Pearson PTE Oral Fluency score, and
that energy-based speech regions are approximate.

Fluency is memoized from the current segmentation and transcript. Existing
re-record/start/Next/disable reset rules automatically remove timing and content
results. No additional independent result state can survive a recording reset.

## Validation

Node coverage verifies active-window arithmetic, edge-delay invariance, two long
pauses versus continuous activity, optional/zero word counts, silence, inclusive
configurable long-pause threshold, immutability, frame-boundary tolerance, ratio
clamping, finite-number validation and configurable neutral feedback. A test uses
the actual segmenter to verify that unreported short gaps affect continuity
without inflating pause counts. Feedback does not change solely because WPM rises.

Browser validation used Edge 154 headless, localhost and a disposable profile,
native MediaRecorder and Web Audio decoding with scheduled oscillator/gain audio.
Controlled adapter transcripts supplied word counts. Tests passed for:

- Timing without available STT; unavailable WPM; closed debug details.
- Both analysis orders and WPM appearing without another waveform decode.
- Continuous activity versus two long pauses, with lower ratio and WPM for pauses.
- About two seconds of leading/trailing delay without distorting active timing.
- Perfect content with long pauses; an omission with continuous timing.
- Failed/empty transcript retaining timing but removing WPM.
- Silent waveform producing no speech and no rate, even with detected text.
- Re-record/Next removing derived results; native resource cleanup on navigation.
- No RA historical outcome changes; RS recording/transcription/save/retry and
  WFD submit/persistence regression.
- No remote app requests or learner audio/transcript uploads observed.

Build, lint, all sixteen test files and whitespace checks passed. Browser-only
instrumentation was kept outside the repository and removed after use. The
headless browser's native local `en-AU` recognition remains unavailable; injected
transcripts do not establish recognition accuracy. Physical-microphone reading,
audibility and feedback calibration across real voices remain pending.

## Next step

Step 06 adds `buildReadAloudAttempt` and persists a stable measured snapshot.
Optional word-count/rate fields must remain absent when unavailable; raw audio
stays transient. Segmentation and feedback heuristics retain their experimental
status, independently of transcript content accuracy.
