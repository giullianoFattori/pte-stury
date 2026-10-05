# Read Aloud — Step 07: content remediation and retry

Read Aloud saves its Attempt, content ErrorRecords and passage ReviewItem through
`studyOutcomeRepository.createStudyOutcome()`. The shared transaction repository,
Dexie version, Attempt builder and timing calculations are unchanged. The page no
longer imports `attemptsRepository` for saving.

Each missing token becomes an omission, extra token an insertion, and substituted
token a substitution; correct tokens produce no record. Error count equals the
sum of the three mismatch counts. Records carry reading/speaking task context,
severity 1, expected/actual tokens and positions, Attempt/StudyItem relationships
and the Attempt timestamp. Explanations use detected/not detected wording because
recognizer output is evidence rather than absolute certainty about speech.

Perfect content creates no review. Any imperfect content creates one sentence
review for the complete passage, regardless of error count. Its sourceAttemptId
and itemId preserve provenance; sourceErrorId is absent. The existing initial
scheduler sets dueAt to createdAt + 24 hours, intervalDays 1, repetitions 0 and
correctStreak 0. Transcript is preferred over the answer fallback. No source audio
or new review type is required.

Timing remains aggregate Attempt evidence only. Perfect content with long pauses
creates no durable error or review. There are no fluency, pronunciation or stress
error labels, and no raw audio/PCM/frame/segment persistence.

After successful Save, **Retry same passage** clears recording, transcription,
content, waveform analysis, derived timing and save state. It retains the passage,
completed preview, microphone readiness and current phrase/stress aids. A retry
creates a new Attempt; earlier Attempts, errors and reviews remain, including a
prior review after a perfect retry. Repeated imperfect attempts each schedule one
review; no premature consolidation occurs.

Existing synchronous save locks, saved-ID guard, mounted guard and disabled
response-changing actions remain in place. Failed persistence leaves the current
analysis available for another Save without re-recording.

## Validation

All eighteen Node test files passed, along with build, lint and whitespace checks.
New tests verify each category, exact explanations and indexes, mismatch/error
count equality, deterministic severity, one review per imperfect attempt,
relationships and 24-hour schedule, answer fallback, timing-only weakness and
nonmutation of previous remediation across perfect/imperfect retries.

Browser checks used Edge headless with a fresh disposable profile, native
MediaRecorder/Web Audio and synthetic oscillator/gain audio. Controlled local
adapter transcripts supplied exact and imperfect content. Verified:

- Exact content with an interior long pause persisted +1 Attempt, +0 Errors,
  +0 Reviews while retaining timing evidence.
- Two omissions and one substitution persisted +1 Attempt, +3 Errors, +1 Review
  with the expected relationships, skills and schedule.
- An injected exception in errors.bulkAdd, after the shared transaction inserted
  the Attempt, rolled back all rows for that save. The exception existed only in
  browser test instrumentation and was removed before retry.
- Rapid synchronous Save activation produced one outcome; delayed persistence
  blocked destructive buttons and guarded direct handler calls as well.
- Retry retained the same passage, microphone, preview and both enabled aids,
  while clearing all response/results/save state. A perfect retry appended a
  distinct Attempt and left earlier errors/review unchanged.
- Next reset aids and save state; refresh retained three independent Attempts and
  their remediation. Aggregate Attempt payloads contained only allowed primitive
  fields; no raw audio was stored.
- Imperfect RS outcome/save/retry and imperfect WFD outcome persistence passed.

Native on-device en-AU recognition was unavailable in this browser. These tests
establish local integration/persistence with controlled transcripts, not actual
recognizer accuracy. Real microphone/STT quality and timing calibration remain
pending for final integration validation. The temporary script, failure hooks and
validation processes were removed/stopped after use.

Step 08 will validate the complete Read Aloud flow and close Activity 04.
