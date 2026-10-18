# Retell Lecture — Activity 08.02

Implemented and verified 2026-10-18. This is local practice feedback, not a Pearson score.

## Official task facts

Pearson PTE Academic Retell Lecture is in Speaking and Writing and tests Listening + Speaking. The lecture can be up to 90 seconds; after it ends, the test gives 10 seconds to prepare and 40 seconds to speak. It is a one-response task with partial credit. Pearson describes Content, Pronunciation and Oral Fluency as traits; Content may receive human review before the official score is final. Learners should retell the lecture in their own words and communicate its main points and relationships.

Verified 2026-10-18 against [Pearson's PTE Academic Speaking & Writing task format](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/) and [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf).

## Exercise behavior

The source plays before preparation begins. Notes remain editable and transient. Replay is explicitly labeled practice assistance and is available only before recording. The recording action becomes available after the 10-second deadline, stops manually or at 40 seconds, and persists the recorder's measured duration. Source playback and recording are mutually exclusive. Local Whisper transcription must report `processedLocally: true`; there is no browser or cloud speech fallback. Transcript, notes, and raw microphone audio are not sent to a remote service, and raw recordings are not persisted.

Audio is excerpted from NASA-produced Houston We Have a Podcast episodes. Original episode pages: [Taking the Temperature of Earth](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/taking-the-temperature-of-earth/), [Space Biology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/space-biology/), [Astrobiology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/astrobiology/), and [Moon Farming](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/moon-farming/). NASA's [media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) applies. This educational app is independent and is not endorsed by NASA. The embedded excerpts and authored transcripts are retained as local study assets.

Each asset is a mono, 24 kHz, 64 kbps MP3 and is verified by local path, SHA-256, MIME, duration and decode. There are four 70–88 second audio items. Assets are package-local; no remote media is requested at learner time.

## Local feedback and persistence

Authored key points are the primary content signal. The local heuristic NFKC-normalizes, lowercases, strips punctuation, removes a small static function-word list, deduplicates terms, then matches each key point when at least 60% of its meaningful unique terms (and at least two, where available) occur in the detected transcript. A key point with one meaningful term requires that term. This is lexical coverage only; it does not infer meaning or compare the full lecture transcript. Optional authored keywords are a secondary diagnostic and cannot increase key-point coverage.

`Attempt.score` is exactly `keyPointCoverage` (0–1), an internal practice coverage metric. Attempt metrics retain coverage, response word count, optional keyword coverage, local pause/speech timing diagnostics, optional local STT confidence, and the `processedLocally` marker. No pronunciation score, official Oral Fluency band, official Content score, or combined Pearson score is claimed. Missed points produce omission records phrased as “not detected in the transcribed response”; at most three missed points become review items.

Session summaries aggregate average key-point coverage, matched/total points, average speech ratio, long pauses, response latency, and speech rate when available. Foundation summaries retain their existing per-task metrics. Retell Lecture is now practice-ready for standalone, Task Practice and Mixed Practice. The Quick pool remains WFD / RS / RA.

## Limitations and evidence

Local Whisper may omit or alter words, so “not detected” does not prove a point was not spoken. Speech segmentation and lexical coverage are deterministic local diagnostics, not Pearson scoring. Human learner benchmark and physical microphone certification remain pending Activity 05.

The Retell Lecture browser run used Linux Chrome, the real app, IndexedDB, MediaRecorder and Web Audio, with a controlled local transcription HTTP response. It verified standalone playback/preparation/recording/transcription/analysis/save, Task Practice capacity and save, and Mixed Practice transition plus summary; page errors and remote requests were zero. It is not native Whisper or human speech-quality evidence. The existing Activity 07 packaged local Whisper path remains separate technical evidence; this change did not alter the runtime service.

Validation passed: content validation/build/verify/audio integrity, all 1,089 application/runtime tests, production build, lint, all 7 package tests, Retell Lecture browser flow, and the Activity 07 exercise, Quick, Task, Mixed, navigation, summary and session-persistence browser regressions. Mixed Practice was updated to assert four ready tasks, 21-item Max capacity and four-task allocation. Dexie remains v3 and the question-bank schema remains v2; the generated bundle and content version change to include 21 learner items, including four Retell Lecture items.

No cloud STT, LLM, embedding or scoring API is used.
