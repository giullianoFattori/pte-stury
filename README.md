# PTE Study App

React/TypeScript study UI with local IndexedDB storage. Read Aloud and Repeat
Sentence use the production local whisper.cpp runtime for transcription.
Experimental browser STT is a legacy diagnostic adapter available only through
explicit injection; it is not a normal provider or fallback. Write From Dictation
does not use STT.

## Content system

[Activity 06.01](docs/content/contract-06.01.md) defines the versioned authoring
contract, permanent IDs, lifecycle and revision policy. [Activity 06.02](docs/content/validation-06.02.md)
adds strict JSON/runtime validation and a validation-only `npm run content:validate`
preview. [Activity 06.03](docs/content/build-06.03.md) adds deterministic discovery,
canonical bundles, SHA-256 manifests and package-owned JSON assets.
[Activity 06.08](docs/content/migration-06.08.md) activates the canonical catalog:
17 active questions (5 WFD, 6 RS, 6 RA), authored only in `content/<task>/<id>.json`.
Startup installs the generated catalog transactionally in Dexie v3. Historical IDs,
learner history and legacy timestamps are preserved; new attempts capture revision 1.
Draft/retired/unavailable content is excluded from practice.

```bash
npm run content:validate
npm run content:build
npm run content:stats
npm run content:verify
npm run content:verify-audio
```

[Activity 06.05](docs/content/query-06.05.md) adds validated metadata filters,
deterministic ordering, counts, coverage diagnostics and pure sampling with an
injected RNG, using the existing indexes. No filter UI or session engine is added.

## Study sessions

[Activity 07.01](docs/study-session/contract-07.01.md) defines the immutable session
contract, lifecycle, attempt linkage and explicit legacy-session compatibility.
[Activity 07.02](docs/study-session/builder-07.02.md) adds deterministic Quick/Task/
Mixed selection, capacity-aware balancing and read-only preparation.
[Activity 07.03](docs/study-session/persistence-07.03.md) adds persisted sessions,
one-active-session enforcement, historical resume and atomic outcomes/progress.
[Activity 07.04](docs/study-session/exercise-adapter-07.04.md) adds reusable WFD/RS/RA
exercises and a shared standalone/session persistence adapter, with guarded saves
and completion callbacks after commit. Session runner UI remains a later step;
standalone scoring is unchanged.
[Activity 07.05](docs/study-session/quick-practice-07.05.md) adds one-click Quick
Practice, active-session Resume, and `/study/session/:sessionId` with saved feedback,
Continue, refresh recovery and conflict reload.
[Activity 07.06](docs/study-session/task-practice-07.06.md) adds single-task sessions
with live capacity, 3/5/Max counts, optional difficulty and shared active-session
handling. Mixed configuration and full summaries remain later steps.

## Local development

From the repository root, start two terminals:

```bash
# Terminal 1
npm run runtime:start
# Terminal 2
npm run dev
```

Open http://127.0.0.1:5173 and choose a speaking task under Study. Check the local
runtime before transcription. Recording, playback and browser RA audio analysis
remain usable when runtime is stopped. Starting it later requires a new check,
not a page reload. Failed transcription preserves the recording for explicit retry.

Native prerequisites and verified engine/model resources are documented in
[runtime/README.md](runtime/README.md). No model auto-download, launcher or installer
exists yet. Audio is processed locally; there is no cloud or browser-STT fallback.

## Validation

```bash
npm run runtime:test
npm test
npm run build
npm run lint
git diff --check
```

Optional Chrome integration suites use an independently installed Playwright and
controlled fixtures, without adding an application dependency:

```bash
node tools/local-stt/scripts/create-controlled-samples.mjs
# PLAYWRIGHT_MODULE may point to an existing Playwright index.mjs.
npm run test:speech-migration                 # mock runtime HTTP; real React/IndexedDB
npm run test:speech-migration -- --real       # six controlled recordings; real Whisper
npm run test:speech-browser                   # runtime recovery and native abort
npm run test:exercise-session-browser         # React adapters + actual IndexedDB; controlled STT
npm run test:quick-practice-browser           # real Quick routes, refresh, completion and two-tab conflict
npm run test:task-practice-browser            # WFD Task completion, capacity, Max and Resume
```

See [05.06 validation](runtime/docs/validation-05.06.md) for measured observations,
coverage and the pending human-speech gate. Controlled synthetic speech proves
functionality, not learner transcription accuracy or final model suitability.

## Archived development POC

Activity 04.9 evidence and the archived UI live under tools/local-stt.
The normal Vite config exposes only the production /api/v1 STT proxy.
Use the separate `npm run dev:stt-poc` command to reproduce the old POC on
127.0.0.1:5178; see [POC instructions](tools/local-stt/README.md).
