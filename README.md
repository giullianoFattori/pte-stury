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
canonical bundles, SHA-256 manifests and package-owned JSON assets. Current question
arrays, seed and study flows are preserved; sync and migration remain subsequent steps.

```bash
npm run content:validate
npm run content:build
npm run content:stats
npm run content:verify
```

The generated bank currently contains only three technical drafts, zero active
practice items. The learner app is not yet reading it. [Activity 06.04](docs/content/sync-06.04.md)
adds transactional IndexedDB sync, revision checks, catalog availability and internal
content state in Dexie v3. Bootstrap retains the legacy seed until real-content
migration; drafts/retired/unavailable content is excluded from practice queries.

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
```

See [05.06 validation](runtime/docs/validation-05.06.md) for measured observations,
coverage and the pending human-speech gate. Controlled synthetic speech proves
functionality, not learner transcription accuracy or final model suitability.

## Archived development POC

Activity 04.9 evidence and the archived UI live under tools/local-stt.
The normal Vite config exposes only the production /api/v1 STT proxy.
Use the separate `npm run dev:stt-poc` command to reproduce the old POC on
127.0.0.1:5178; see [POC instructions](tools/local-stt/README.md).
