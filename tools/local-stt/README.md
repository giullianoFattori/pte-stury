# Activity 04.9 — local whisper.cpp proof of concept

The primary architecture direction is native local Whisper. Browser SpeechRecognition
is retained temporarily as a diagnostic; it is deprecated as the primary STT path.
This POC does not change production transcription, persisted engine types, scoring,
errors, scheduler, reviews or mastery. Activity 05 will productize the runtime.

Technical results are in [RESULTS.md](RESULTS.md). Five real learner recordings are
**pending**, by agreement with the user: current recordings exist only as browser
Blobs. Controlled synthetic tests do not close that quality gate or Activity 04.

## Setup on this Linux machine

Development prerequisites: Git, CMake, a C/C++ compiler, make, ffmpeg/ffprobe, and
Node with native TypeScript stripping (tested with Node 25.8.1). Nothing is bundled
for end users yet. Run from the repository root:

```bash
git --version
cmake --version
c++ --version
ffmpeg -version
bash tools/local-stt/scripts/setup-whisper.sh
```

On this machine CMake was missing and passwordless sudo was unavailable. A local
PyPI CMake wheel was installed without changing system packages:

```bash
python3 -m pip install --target .local-runtime/cmake-package cmake==3.31.6
```

Setup automatically uses that binary if system CMake is unavailable. Alternatively
set `CMAKE_BIN` to your CMake executable. Source is pinned to whisper.cpp v1.8.3,
revision `2eeeba56e9edd762b4b38467bab96c2517163158`. Setup accepts only `base.en` or
`small.en`, builds CPU Release binaries with four build jobs by default, downloads
through the official model script, and verifies the upstream documented SHA-1.
Unexpected source modifications or model hashes cause failure. SHA-256 is also
printed for the local artifact. No arbitrary model URLs are accepted.

| Model | Approximate upstream size | Documented SHA-1 |
| --- | --- | --- |
| base.en | 142 MiB | `137c40403d78fd54d454da0f9bd998f78703390c` |
| small.en | 466 MiB | `db8a495a91d927739e50b3fc1cc4c6b8f6c2d022` |

Sources: [official model tooling and checksums](https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/models/README.md)
and [native build/audio instructions](https://github.com/ggml-org/whisper.cpp/tree/v1.8.3).

The intentional [server-poc.patch](scripts/server-poc.patch) restricts the official
HTTP example, rather than implementing an inference engine. It removes wildcard
CORS, rejects requests with any browser Origin, blocks all routes except POST
`/inference`, including `/load`, caps payloads at 12 MiB and decoded audio at 180 s,
requires WAV magic, and rejects unknown multipart fields (including prompts).
Run this patched build with the supplied launch script. The stock example's
`--convert` shell conversion is deliberately disabled.

## Independent CLI validation

Write a reference in an ignored directory and transcribe the upstream known WAV:

```bash
mkdir -p tools/local-stt/tmp
printf '%s\n' 'And so my fellow Americans ask not what your country can do for you ask what you can do for your country.' > tools/local-stt/tmp/jfk.txt
bash tools/local-stt/scripts/transcribe-test.sh \
  .local-runtime/whisper.cpp/samples/jfk.wav tools/local-stt/tmp/jfk.txt ra base.en cli
```

For your own recording:

```bash
bash tools/local-stt/scripts/transcribe-test.sh \
  /path/recording.webm /path/manual-learner-reference.txt rs base.en cli /path/expected-pte.txt
```

Arguments are `AUDIO MANUAL_REFERENCE [ra|rs] [base.en|small.en] [cli|server]
[EXPECTED_PTE]`. The manual reference measures engine accuracy; optional expected
PTE text measures learner content. Neither text is provided to Whisper. If expected
text is omitted, comparison uses the reference, useful for the independent fixture.
Server mode requires confirming the model selected at server launch; the client
does not attest the loaded model. CLI time includes process/model startup; server
time covers the HTTP inference round trip with the model already loaded.

Audio preprocessing uses ffmpeg argument arrays, mono, 16 kHz, PCM s16le WAV. A
bounded decode also rejects durationless WebM longer than 180 s. Input, WAV, and CLI
transcript files live in a private temporary directory and are deleted in `finally`
on success, rejection, inference failure or cancellation. Caller-provided files
are untouched. Output JSON contains raw text, S/D/I, word errors, WER, duration,
inference time, RTF, total time, and unchanged RA/RS comparison/metrics.

## Browser POC

Run each service in its own terminal:

```bash
bash tools/local-stt/scripts/start-server.sh base.en
node tools/local-stt/scripts/bridge.mjs
npm run dev
```

Open [the dev POC](http://127.0.0.1:5173/tools/local-stt/index.html).
Choose one of two RA or three RS cases; record with the microphone or select an
existing app audio file, then transcribe locally. RS source audio can be played
before the response; the source transcript is revealed only after transcription.
Listen to the learner recording and enter its manually verified transcript to
measure WER. Nothing is saved to the study database or disk from the page.

```text
MediaRecorder Blob → same-origin Vite dev proxy
→ 127.0.0.1:8766 bridge → local ffmpeg temporary WAV
→ 127.0.0.1:8765/inference → whisper.cpp base.en → transcript
→ existing compareReadAloud / compareRepeatSentence and metrics/chunks
```

The bridge accepts only loopback connections and localhost/127.0.0.1 development
origins on port 5173. It validates content type and decoded audio container, rejects
video streams, bounds bytes and duration, allows one active request, and has
conversion/request/inference timeouts. Browser-provided filenames, text, model IDs,
URLs and shell commands are never forwarded. The WAV upload uses a fixed filename.
No cloud STT fallback exists. Downloads use the internet; inference does not.
Server transcript stdout is discarded; the bridge never logs recordings/text.
Ctrl+C stops each runtime. Bridge SIGINT/SIGTERM closes connections, aborting active
requests so cleanup completes. SIGKILL or power loss may leave temporary files;
Activity 05 must add crash recovery. This is a development POC, not a packaged API.

The separate `WhisperCppPocResult` preserves local transcription semantics without
pretending to satisfy the existing `engine: 'browser-on-device'` union. No unsafe
casts or domain union changes are used; Activity 05 owns that migration.

## Reproduce controlled technical tests

```bash
node tools/local-stt/scripts/create-controlled-samples.mjs
# With the server, bridge and Vite running, and Playwright available:
node tools/local-stt/scripts/browser-smoke.mjs
```

Fixture generation uses local ffmpeg/flite `slt` voice and writes five synthetic
WAVs and generator references under ignored `tmp/controlled/`. This requires an
ffmpeg build with flite. The browser smoke test uses installed Chrome and optional
Playwright (`PTE_POC_CHROME` and `PTE_POC_PLAYWRIGHT_MODULE` can specify paths).
It records each synthetic source through an actual MediaRecorder audio stream,
submits its WebM Blob through the UI, checks RS answer hiding, exercises metrics
and chunk analysis, measures WER, and rejects external HTTP page requests. It uses
headless Chrome with `--no-sandbox` for development automation; the ordinary app
does not disable browser security. Results are written only to ignored `tmp/`.

```bash
npm test
npm run build
npm run lint
git diff --check
```

Tests cover word error accounting, RA/RS compatibility, temporary cleanup on
success/failure, fixed inference fields, and bridge origin/type/size/route rejection.
Audio tests skip if ffmpeg is unavailable. Loopback tests need permission to bind
locally in restricted environments.

WER uses minimum word Levenshtein edits and the app's existing text normalization.
The learner feedback alignment uses LCS and stays unchanged; its edit counts can
differ from minimum edit WER. WER can exceed 100% with many insertions. Use a manually
verified **spoken** reference, not the intended passage, for learner STT benchmarking.

## Licensing checkpoint for Activity 05

| Component | License / distribution checkpoint |
| --- | --- |
| whisper.cpp and ggml | MIT; preserve upstream notices and the POC patch |
| Whisper code and weights | MIT, per [Whisper upstream](https://github.com/openai/whisper#license); model source is the official converted-weight repository |
| ffmpeg/ffprobe | LGPL 2.1+ baseline, GPL when GPL parts are enabled; this machine's Ubuntu 6.1.1 build uses `--enable-gpl`, so do not assume an LGPL-only bundle |
| Node.js launcher | MIT plus bundled dependency notices; collect the exact packaged runtime license inventory in Activity 05 |
| CMake wheel | Build-only; installed distribution contains BSD-3 and Apache-2.0 notices; not a planned runtime dependency |
| cpp-httplib / nlohmann JSON | MIT headers in pinned whisper.cpp source; preserve notices in distribution |
| flite / Playwright / Chrome | Controlled test tools only, not app runtime dependencies; review exact licenses if ever distributed |

Primary sources: [whisper.cpp license](https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/LICENSE),
[Whisper license](https://github.com/openai/whisper/blob/main/LICENSE), and
[FFmpeg licensing](https://ffmpeg.org/legal.html). No runtime or weights are committed
or commercially distributed by this step. Activity 05 must inventory actual bundled
versions, options, transitive notices and redistribution obligations.
