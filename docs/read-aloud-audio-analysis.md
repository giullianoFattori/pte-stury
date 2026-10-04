# Read Aloud — Step 04: local waveform segmentation

Implemented on 2026-10-05. **Analyse audio locally** operates on the current
recorded Blob independently of transcription. Results remain in memory and are
shown under optional **Segmentation details**. There is no fluency score, pause
penalty, pronunciation/stress assessment or phrase-boundary score in this step.

## Browser and domain boundary

`decodeAudioBlob` owns Web Audio feature detection, decoding and context cleanup.
It averages every decoded channel into a new mono Float32Array, validates the
decoded data and returns the decoded sample rate and sample-derived duration.
An AudioContext created for analysis closes in `finally` on success or failure.
Unsupported, empty/invalid and decode failures have controlled messages; browser
exception text is not displayed.

`domain/audio-analysis` receives only PCM samples, sample rate and configuration.
It imports no React, DOM, Web Audio or database APIs. No DSP dependency was added.
RMS operates on each sample range without full-waveform copies. Percentile
calculation sorts a copy of frame levels; frame order and input samples remain
unchanged. PCM is temporary; retained UI state contains frames and segment metadata.

## Experimental segmentation contract

Defaults: 30 ms windows, 10 ms hops, 20th percentile noise floor, threshold
12 digital dB above that floor clamped to -60…-20, minimum speech 150 ms,
merge gaps shorter than 120 ms, minimum interior pause report 150 ms.

The reported levels are `20 * log10(max(RMS, 1e-12))`, labelled **dBFS-like**.
They are digital relative levels, not physical room SPL. Zero samples produce
a finite -240 floor. Configuration and invalid sample rates/samples are checked.

Windows overlap for energy measurement. A frame's cleaned label owns the interval
from its start to the next frame's start, with the last cell ending at the audio
duration. Segments therefore do not overlap or extend past the recording end.
Partial final windows are included. Boundaries are approximate energy-window
boundaries, not exact word or phoneme timestamps.

Stages: calculate frames → estimate floor/threshold → classify → merge short
interior gaps → remove short speech bursts → rebuild segments. `isSpeech` contains
the cleaned labels. Leading/trailing silence is always retained, including short
edge silence and an all-silent recording. Interior silence shorter than
`minimumPauseMs` is omitted from `pauseSegments`, but remains in frame labels;
pause reports alone therefore need not account for all silence. Future total
silence duration can be derived from recording duration minus speech duration.

These heuristics identify probable activity, not perfect voice detection. Steady
loud noise may be labelled speech. Near-continuous speech may contaminate the
percentile floor; very quiet speech may fall below the clamp. Channel averaging
can also cancel opposite-phase signals. Gain, noise and timing should be checked
against actual playback before drawing practice conclusions.

## State and privacy

Analysis starts only after an explicit click and requires a completed recording.
Busy locks prevent duplicate analysis. Recording start, Record again, Next and
microphone disable invalidate analysis, transcription and content feedback as
appropriate. Mounted/generation guards suppress late decode completion after
reset or unmount; an outstanding decode still closes its context when it finishes.
STT and audio analysis can succeed/fail separately on the same recording.

No waveform, Blob, frames or segmentation results are persisted or uploaded.
Attempt/ErrorRecord/ReviewItem models and Dexie schema are unchanged.

## Validation

Node tests cover RMS ranges, zeros, constant low noise, single/multiple activity
blocks, long pauses, short-gap merging, short-spike removal, quiet/loud activity,
partial windows, deterministic/no-mutation behavior and 8/16/44.1/48 kHz timing.
They also verify mono averaging, legacy constructor support, empty/invalid data,
controlled errors and context close on success/failure.

Browser integration uses Edge 154 headless, localhost and a disposable profile.
An oscillator/gain schedule supplied native MediaStream audio; recording used
native MediaRecorder, and the application used native Web Audio decoding. The
decoded bytes matched the exact current recording Blob. Playback progressed.
Two activity blocks separated by about one second of silence produced two speech
regions and three pause regions; an 80 ms gap merged; silent recording produced
zero speech regions. Analysis succeeded while local STT was unavailable.

Injected decode errors and missing Web Audio showed controlled messages. Delayed
native decoding tested re-record, Next and route unmount: old results stayed
hidden and all analysis contexts closed. RA historical outcomes remained unchanged.
Controlled transcripts verified simultaneous RA content/audio results and RS
transcription/save/retry; a WFD submission persisted successfully. Observed app
network requests were same-origin GETs, without waveform/audio/transcript uploads.

Build, lint, all fifteen test files and diff whitespace checks passed. Browser
test instrumentation stayed outside the repository and was removed after use.
Synthetic activity is evidence of implementation behavior, not detection quality
for a learner's voice. Normal reading, quiet/loud speech and room/fan noise still
need physical-microphone playback comparison before tuning these defaults.

## Next step

Step 05 derives timing and speech-rate practice signals from these measured
regions. Long-pause teaching thresholds remain separate from segmentation settings.
Those signals will remain internal metrics, not official Pearson scores.
