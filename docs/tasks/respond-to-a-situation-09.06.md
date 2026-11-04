# Respond to a Situation — Activity 09.06

**Status:** Implemented; local-practice diagnostics only  
**Verified:** 2026-11-04
**Content schema:** v2  
**Dexie:** v3

## Official format

Pearson's current PTE Academic Speaking & Writing format describes a written and spoken everyday situation, prompt text up to 60 words, 10 seconds to prepare, and 40 seconds to respond. Speaking is the skill assessed. Pearson lists Content, Pronunciation, and Oral Fluency traits; this app does not reproduce those traits or an official task score.

Official sources last checked 2026-11-01:

- [Pearson PTE Academic Speaking & Writing format](https://www.pearsonpte.com/pte-academic/test-format/speaking-writing/)
- [Pearson PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/pte-academic-test-taker-score-guide.pdf)

## Learner content and prompt playback

Five active scenarios are authored under `content/respond-to-a-situation/` with a role, audience, relationship, communication goal, expected register, and three required points. All prompt audio is package-local and integrity-checked by the existing audio pipeline. The spoken `promptText` is reused from internal, already-authored local recordings and matches those clips verbatim. Situation context and communication instructions are displayed alongside the audio.

These short recordings are audio cues rather than a newly recorded narration of the complete written scenario. The written scenario remains available throughout the task. This is a practice-format limitation; it does not affect local processing or authored response diagnostics.

## Exercise timing and speech workflow

The learner enables the microphone before starting, so browser permission handling does not consume the timed task. Start Question plays the local prompt once. When playback ends, a monotonic 10-second preparation countdown begins. Recording starts automatically when preparation ends and is stopped manually or at the 40-second deadline. Notes are transient, are not scored, and reset on retry or item change.

Learner audio is recorded with the existing MediaRecorder hook and sent only to the existing local Whisper runtime. Prompt audio is never sent for transcription. A response can be saved only after `processedLocally === true`, a usable transcript, and local audio analysis are available. Raw recording data is not persisted.

## Local scoring and feedback

`Attempt.score` is exactly the authored required-point coverage ratio (`matchedRequiredPoints / totalRequiredPoints`). Coverage uses the shared deterministic lexical matcher and signals lexical evidence only; it does not establish semantic equivalence or human-level appropriateness. Communication-goal evidence and optional authored useful-function matches are separate diagnostics.

Register feedback reports explicit phrase signals only. It has no numeric appropriateness value. Shared Read Aloud acoustic analysis provides local fluency diagnostics. Whisper output is not used as a pronunciation score. Missed required points create bounded omission Errors and up to three scenario ReviewItems.

Metrics store required-point coverage, communication-goal evidence, useful-function count, expected-register code (`0=formal`, `1=neutral`, `2=informal`), explicit register-signal count/warning flag, local fluency metrics, and local-processing evidence. Session summaries aggregate task coverage, communication-goal detections, fluency, and optional speech rate from persisted Attempts; summary rebuild is validated against the session ledger.

## Session integration

Respond to a Situation is practice-ready in Standalone and Task Practice and is available to Mixed Practice. Quick remains the intentional WFD / RS / RA pool. The task has an explicit dispatcher and summary variant; its readiness is covered by the same registry invariant as other ready tasks. Dexie remains v3; no content envelope or database migration was needed.

## Validation evidence

- Content bank: 66 active learner items; Respond to a Situation: 5.
- Content version: `sha256:a5fda9867c77b476162f9a8449c5e735037fdf13049fdb137fb09950cfb3ea6f`.
- Content validation/build/verify: PASS.
- Local audio inventory: 28 referenced assets, 9,587,504 bytes, 1,227,696 ms aggregate declared duration; decode/integrity verification is run with `content:verify-audio`.
- Targeted task scoring/content/Attempt/Error/Review/summary tests: PASS (7).
- Content migration tests: PASS (5); old foundation values and revisions are unchanged.
- TypeScript and production build: PASS. Vite retains the existing >500 kB main-chunk advisory.
- `npm test`: PASS, 1,202 application/runtime tests.
- `npm run build`: PASS. The existing Vite main-chunk advisory remains (>500 kB).
- `npm run lint`: PASS with no warnings.
- `npm run package:test`: PASS, all 7 package tests.
- Respond to a Situation controlled browser flow: PASS for standalone playback → 10-second preparation → controlled recording → local transcription → analysis → save; Task Practice recording/save with the Attempt linked to its session and progress advanced; and a two-task WFD + RTS Mixed queue. No page errors or unexpected remote requests. The browser test uses controlled audio, microphone and STT fixtures; it is orchestration evidence, not human speech-quality evidence.
- Speech migration browser regression: PASS with mock runtime HTTP and real browser/IndexedDB; zero outbound requests and zero browser-STT calls.
- Linux package rebuilt from the current 66-item bank. Extracted-package smoke: PASS; all 14 standalone routes and session route served, 28 local audio assets and 4 local images verified, RTS route/session route and five items verified, local transcription technical path passed, and restart/quit/port-collision/shutdown cleanup checks passed. Internal host smoke only; clean-machine and Windows/macOS certification remain Activity 05 gates.
- `git diff --check`: PASS.

The content build is stable at `sha256:a5fda9867c77b476162f9a8449c5e735037fdf13049fdb137fb09950cfb3ea6f`. Five RTS items bring the bank to 66 active items. The 28 referenced audio assets total 9,587,504 bytes and 1,227,696 ms declared duration; all decode and integrity checks pass. Four local images total 215,069 bytes and pass image integrity checks. Existing duplicate-prompt/audio warnings remain informational; RTS prompt clips intentionally reuse local clips whose spoken text matches each authored `promptText`.

Controlled browser transcription/media fixtures demonstrate orchestration only. Human speech quality, physical microphone certification, and cross-platform clean-machine validation remain separate Activity 05 gates.

## Limitations

- No official Pearson Content, Pronunciation, or Oral Fluency score is claimed.
- Required-point and communication-goal coverage are lexical heuristics.
- Register signals are a small explicit phrase list, not a sociolinguistic classifier.
- The source audio clips are short spoken cues, not narration of the full displayed scenario.
- No cloud API, browser STT fallback, or remote learner content is used.
