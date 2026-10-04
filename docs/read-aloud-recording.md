# Read Aloud — Step 02 validation

Validated on 2026-10-04 using Edge 154 headless on localhost and a disposable
browser profile. Permission errors were injected; an oscillator supplied a
native MediaStream. Recording used native MediaRecorder, nonempty audio Blobs
and real browser playback. Playback time advanced; subjective audibility and
physical microphone permission were not assessed by this automated check.

## Implemented behavior

`/study/read-aloud` loads the RA bank through `studyItemsRepository`. The canonical
passage stays visible and selectable during preview, recording and playback.
The learner completes preview with **I'm ready to read**. A ready microphone
alone cannot bypass that gate. There is no timer, automatic permission request
or automatic recording.

Phrasing and stress aids start disabled. The optional training view uses
`phraseGroups` for separators and normalized exact lexical matching for
`stressWords`. Emphasis uses bold text and underlining. The canonical passage
is unchanged; aids do not claim measured stress or mandatory pause positions.

Both RA and RS use `src/shared/speech` hooks and components. Microphone lifecycle
logic moved unchanged. Recorder lifecycle logic changed only its two RS-specific
console messages. Shared controls have generic classes, unique heading IDs and
optional task instructions; RS retains its existing task copy and source-audio
recording guard.

## Browser checks passed

- Study links to RA; all six passages cycle back to the first.
- Readiness can be activated with Enter; recording stays disabled before preview.
- No aids, phrasing only, stress only and both render correctly. Highlighted
  words match curated targets, including case and punctuation normalization.
- Denied and missing-microphone errors appear as readable states.
- Native recording creates a nonempty Blob and playback progresses.
- Next/Disable are blocked during recording, including finalization.
- Record again revokes the old URL and preserves passage, preview, aids and mic.
- Next clears recording, preview and aids while keeping the microphone ready.
- Route navigation stops microphone tracks and revokes recording URLs.
- RS enable/disable, record/stop/playback/re-record, Next, source overlap guard
  and navigation during active recording continue to work.
- Historical attempts/errors/reviews remain unchanged during RA practice.

Run `npm test`, `npm run build`, `npm run lint` and `git diff --check` for routine
checks. All passed for this step. Browser-only instrumentation was kept outside
the repository and removed afterward.

## Regression procedure

With a physical microphone, preview RA, enable both aids, record and listen to
playback. Record again and verify readiness/aids stay set. Advance and verify
preview/aids reset while the microphone stays ready. Leave the page and confirm
the browser microphone indicator disappears. Repeat the RS microphone/recording
cycle and verify source playback cannot overlap recording.

RA has no transcription, scoring, audio analysis or outcome persistence in
Step 02. Those remain separate later steps. RS's real local-STT quality gate
is unchanged by this extraction.
