# Summarize Group Discussion — Activity 08.03

Implemented and verified 2026-10-20. Feedback is local practice diagnostics, not a Pearson score.

## Official task facts

Pearson describes a discussion between three people, lasting up to three minutes. In the test it plays once, followed by 10 seconds to prepare and up to two minutes to respond; the response is recorded once. The task assesses Listening and Speaking with partial credit. Its scoring dimensions include Content, Pronunciation and Oral Fluency. Pearson's Content guidance expects a coherent paraphrase of the main topic, important details, each speaker's contribution and relationships between views. The app does not reproduce these official scores.

Verified 2026-10-18 against [Pearson's PTE Academic Speaking & Writing task format](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/) and [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/resources/PTE-Academic-Test-Taker-Score-Guide.pdf).

## Exercise and content

Three 179.064-second local audio clips accompany authored speaker identities, ordered discussion turns, key points and speaker contribution points. Relationships are authored for two discussions; the third intentionally omits relationship scoring. Audio excerpts come from NASA-produced *Houston We Have a Podcast*, episode “Houston, We Have a Birthday.” See [NASA's episode page](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/houston-we-have-a-birthday/) and [NASA media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). This independent educational app is not endorsed by NASA. The clips are mono 24 kHz MP3 files validated for local path, SHA-256, MIME, duration and complete decode. Learner-time media stays package-local.

The learner has transient notes for the topic, each of the three speakers, and relationships. The first playback is primary; replay is labeled practice assistance. Source audio is disabled during recording. Once playback ends, a deadline-based 10-second preparation countdown starts. Local microphone recording can stop early or auto-stops at 120 seconds. Timer and media resources clean up when the exercise unmounts or changes item.

## Local diagnostics and persistence

The content contract requires `speakerPoints` to cover all three known speakers for published content. A deterministic lexical matcher reuses Retell Lecture normalization and thresholds: NFKC, lowercase, punctuation normalization, unique response terms, a small static stopword set, and a 60% anchor-term threshold (at least two meaningful terms when available; a single meaningful term must match). It checks authored main points and speaker contributions separately. Relationship coverage is calculated only where relationships were authored. This measures lexical coverage, not paraphrase meaning or semantic understanding; repeated wording cannot inflate counts.

`Attempt.score` is exactly `keyPointCoverage` from 0 to 1. Speaker and optional relationship coverage remain separate. Attempts require nonempty locally processed transcription, measured duration no longer than 120 seconds, and local audio analysis. Fluency values are labeled local diagnostics. Whisper is not used to score pronunciation. Errors are omission records prioritized for unrepresented speakers, missed main points and missed relationships (at most six); up to three central misses become review items. Feedback says “not detected in your transcript” because speech recognition can miss spoken content. Raw recordings and notes are not persisted, and no cloud speech or scoring service is used.

Standalone, Task Practice and Mixed Practice use the shared persistence path. With three SGD items, Task Practice enables 3 and Max and disables 5; Max resolves from the live IndexedDB capacity. Session summaries report average main-point coverage, pooled key-point counts, average speaker coverage, pooled speaker slots, optional relationship coverage, speech ratio, long pauses, response latency and speech rate when available. Quick Practice remains the intentional WFD / RS / RA pool. The task registry now includes SGD in the practice-ready order. Question-bank schema remains v2, content IDs are `sgd-000001` through `sgd-000003`, and Dexie remains v3. The generated bank contains 24 learner items (17 foundation, 4 Retell Lecture and 3 SGD) and 18 validated audio assets.

## Limitations and evidence

The lexical heuristic can miss valid paraphrases or credit coincidental vocabulary. No official Pearson Content, Pronunciation, Oral Fluency or total task score is claimed. Human learner benchmark and physical microphone certification remain pending Activity 05.

The controlled browser test uses Linux Chrome, the actual app, IndexedDB, MediaRecorder and Web Audio, and a controlled local transcription response. It verifies standalone feedback and Attempt persistence, Task Practice capacity and Max session creation, a Retell Lecture / SGD Mixed Practice transition and summary. Separate persistence tests verify task-session Attempts, Errors, Reviews and summary integrity. This is technical browser evidence, not human speech quality or packaged-platform evidence.
