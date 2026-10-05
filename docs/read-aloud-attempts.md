# Read Aloud — Step 06: Attempt persistence

Read Aloud now explicitly saves an aggregate snapshot through
`attemptsRepository.create()`. Save requires a ready recording, a successful local
transcript with usable words, content comparison/metrics, successful segmentation
and derived timing metrics. It never saves automatically.

`Attempt.score` is unrounded `textCoverage` only. Timing and content remain
independent: an exact transcript with long pauses can have score 1. The detected
transcript is `responseText`; recorder duration is `durationMs`; decoded waveform
duration is `metrics.audioDecodedDurationMs`. These durations need not match.

The builder selects content counts/rates, timing aggregates, the actual long-pause
threshold used, optional detected-word count/WPM and STT confidence/local flag.
Unavailable count/rate fields are omitted, not replaced by zero. Confidence uses
the existing metadata fallback of zero if unavailable. Numbers must be finite and
non-negative; content coverage must be between zero and one. Non-RA items,
nonlocal results and unusable transcripts are rejected. No-speech timing retains
`hasSpeech = false` and absent WPM, rather than inventing a rate.

The builder constructs a detached snapshot without repository/browser-audio work;
UUID and timestamp generation follow the existing Attempt builder convention.
Only primitives enter metrics. No Blob, URL, PCM, AudioBuffer, frame/segment arrays,
feedback strings, pronunciation/stress scores, ErrorRecords or ReviewItems are
stored. Dexie schema/version and dependencies are unchanged.

A synchronous in-flight ref and a saved-ID ref protect against rapid duplicate
writes. Record again, Start, Next, microphone disable, retranscription and waveform
analysis are guarded while Save is pending; their buttons are disabled as well.
Success prevents another save of that recording even if it is reanalysed or
retranscribed. Re-record/new recording/Next/disable clears the saved state. New
recordings append independent Attempts with new UUIDs, retaining previous history.
Repository failure keeps all evidence and allows Save to retry. Async completion
does not update component state after unmount.

## Validation

- Node tests verify exact snapshots, detached history, omissions/insertions/
  substitutions, raw unrounded score, optional fields, threshold retention,
  local-only/task guards and finite-number validation of every persisted number.
- Edge headless used a disposable profile, native MediaRecorder and Web Audio
  decoding of synthetic oscillator/gain audio; controlled local-adapter transcripts
  supplied content. A perfect transcript with a one-second interior pause preserved
  score 1, long-pause metrics and approximately two-second leading/trailing delays.
- Two synchronous Save activations created one row. A delayed repository call
  blocked destructive controls, including direct handler invocations bypassing
  disabled buttons. A forced failure before writing left evidence intact and a
  retry succeeded without re-recording.
- Same passage produced two distinct IDs/timestamps, with independent perfect and
  omission snapshots. Re-record and Next reset state; refresh retained both Attempts
  and cleared transient audio. RA errors/reviews remained empty.
- RS imperfect save/retry and WFD imperfect submit preserved their Attempt, Error
  and Review persistence paths.
- Build, lint, all seventeen test files and whitespace checks passed.

Native local `en-AU` STT was unavailable in the validation browser. Controlled
transcripts verify integration and persistence, not real recognition accuracy.
Physical-microphone recording/STT quality and real-voice timing calibration remain
pending as described in the Step 05 timing notes. Temporary failure/delay/STT hooks
were confined to the external browser test script, never production code.

Step 07 can add observable content ErrorRecords, review strategy and retry UI,
then replace Attempt-only persistence with the atomic study outcome repository.
