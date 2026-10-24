# Summarize Spoken Text — Activity 08.06

Verified against current Pearson PTE Academic task guidance and the PTE Academic Score Guide on 2026-10-24:

- Listening + Writing; one 60–90 second recording; one playback; 10 minutes for listening and writing; recommended response 50–70 words.
- Form: 2 points for 50–70 words; 1 point for 40–49 or 71–100; 0 below 40 or above 100. Pearson's guide also specifies zero Form for all capitals, no punctuation, bullet-only responses, and very short sentence patterns. Other Pearson scoring traits are Content, Form, Grammar, Vocabulary and Spelling.
- Sources: [Pearson Summarize Spoken Text](https://www.pearsonpte.com/pte-academic/test-format/listening/) and [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/PTE-Academic-Test-Taker-Score-Guide.pdf).

The task starts on an explicit practice button; the 10-minute monotonic timer and one source playback start together. Replay is unavailable during an attempt. Retry starts a new attempt and permits one new playback. At timeout the source is stopped, editing locks, the response remains available for review, and saving stays explicit. Notes remain local and transient.

Four active items use original lecture transcripts, authored key points, and example summaries. Local source clips are licensed NASA *Houston We Have a Podcast* excerpts already used in Retell Lecture, so audio bytes are shared rather than duplicated. Sources: [Taking the Temperature of Earth](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/taking-the-temperature-of-earth/), [Space Biology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/space-biology/), [Astrobiology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/astrobiology/), and [Moon Farming](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/moon-farming/). See [NASA image and media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). This is an independent practice app and is not affiliated with Pearson or NASA.

## Local practice diagnostics

The same Unicode whitespace word counter is used in the editor, Form checks, Attempt metrics, and summary. The task applies the specified word bands and transparent local structural checks. Sentence segmentation protects common abbreviations and decimal points. “Very short sentences” is approximated conservatively as at least three detected sentences, each no longer than five lexical tokens. These checks are not a reproduction of Pearson's linguistic Form judgement.

Key-point coverage uses the shared deterministic lexical matcher against authored key points. It does not compare against the full transcript or example summary and cannot reliably understand paraphrase or detect a misrepresented topic. Feedback reports “key-point evidence detected.” The transcript and example summary remain hidden until response submission.

Attempt score is `keyPointCoverage × formCredit`, where Form credit is Form points divided by two. It is an internal practice metric only, not an official PTE score. Writing mechanics are descriptive. The app does not assign official Content, Grammar, Vocabulary or Spelling scores, nor does it infer spelling correctness. Form and omission Errors are capped at five; ReviewItems are capped at three.

## Integration and evidence

SST is available in standalone practice, Task Practice and Mixed Practice, and has a dedicated session summary reporting Form bands, average word count and lexical key-point coverage. Quick Practice remains WFD / RS / RA. SST needs local package audio but no microphone, MediaRecorder, speech transcription runtime, or remote service. Content schema remains v2 and Dexie remains v3.

Validation on 2026-10-24: all 1,154 application/runtime tests passed; all seven package tests passed; content validation/build/verification and audio/image integrity passed; TypeScript production build, lint and `git diff --check` passed. The SST browser suite passed standalone Form 0/Form 2 saves, one playback and retry behavior, timeout retention, three-item Task Practice summary, Mixed SWT↔SST transitions and summary. It observed zero MediaRecorder instances, zero speech-runtime requests, zero external requests, and Dexie v3. Linux package smoke passed with four SST items, both standalone/session routes, and local SST audio delivered from the package. This is host smoke evidence, not clean-machine or cross-platform certification. Limitations include lexical coverage, approximate sentence/Form heuristics, and no claim of human evaluator equivalence.
