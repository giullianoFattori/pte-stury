# Third-party inventory — contract baseline

Activity 05.03 implements a Node.js runtime with local system preprocessing,
not a distributable native package. This file records the verified POC baseline and obligations to carry into packaging; it is
not a complete notice bundle or a claim that all components below are shipped.
No compiled binaries, model weights or learner recordings are committed here.

| Component | Verified/planned version and source | License checkpoint |
| --- | --- | --- |
| whisper.cpp | POC v1.8.3, revision `2eeeba56e9edd762b4b38467bab96c2517163158`, [upstream](https://github.com/ggml-org/whisper.cpp/tree/v1.8.3) | MIT; include upstream copyright/license and record downstream patches |
| ggml | Source included in pinned whisper.cpp checkout | MIT; collect its actual license/notices from the shipped revision |
| Whisper English weights | POC `ggml-base.en.bin`; small.en candidate, not downloaded/measured; [official model tooling](https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/models/README.md) | Whisper code/weights are MIT per [upstream license section](https://github.com/openai/whisper#license); retain provenance/notices alongside model artifacts |
| ffmpeg / ffprobe | Production preprocessing currently invokes installed Ubuntu `6.1.1-3ubuntu5` system ffmpeg/ffprobe; no binaries bundled or final redistribution build selected | LGPL 2.1+ baseline; GPL parts change the obligations. This machine's build enables GPL; do not label it LGPL-only |
| cpp-httplib / nlohmann JSON | Used by the POC official server, headers in pinned whisper.cpp source | MIT; inventory exact header revisions/notices only if used in final runtime |
| Node.js | Shell tested with installed v25.8.1; [exact source](https://github.com/nodejs/node/tree/v25.8.1), [license/notices](https://github.com/nodejs/node/blob/v25.8.1/LICENSE) | MIT plus its bundled dependency notices; preserve the exact runtime inventory if packaged |
| HTTP / filesystem / JSON | Node v25.8.1 built-ins (`node:http`, filesystem, streams, child_process, native JSON); internal bounded multipart parser, no external HTTP/JSON/upload library added | Covered by the Node distribution and its component notices; no new npm runtime dependency |
| Launcher libraries | Not selected/implemented | Record exact dependencies and licenses when introduced |
| CMake | Build-only local wheel 3.31.6 | Distribution contains BSD-3/Apache-2.0 notices; not a product runtime dependency |
| flite, Playwright, Chrome | Controlled test tooling only | Not product runtime assets; review exact licenses if they are ever distributed |

Baseline model integrity:

| Model | Upstream documented SHA-1 | Status |
| --- | --- | --- |
| base.en | `137c40403d78fd54d454da0f9bd998f78703390c` | Verified in 04.9 |
| small.en | `db8a495a91d927739e50b3fc1cc4c6b8f6c2d022` | Candidate only |

Verified base.en SHA-256:
`a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`.
Hash/source validation is runtime-owned. Do not accept arbitrary model URLs or
claim a new download is verified merely because the model ID matches this table.

Before native/commercial distribution, replace this baseline with an exact shipped
inventory: platform/architecture, runtime and engine versions, pinned revisions,
model source/checksums, preprocessing build/configuration and dependency versions.
Include applicable complete license texts, copyright notices, downstream patches,
corresponding-source/build instructions and other required redistribution artifacts.
Reproducible build details must identify compiler, backend flags and native inputs;
the POC [setup script](../tools/local-stt/scripts/setup-whisper.sh) is reference
evidence, not the production build pipeline. No arbitrary precompiled downloads.

Primary license sources: [whisper.cpp MIT](https://github.com/ggml-org/whisper.cpp/blob/v1.8.3/LICENSE),
[Whisper MIT](https://github.com/openai/whisper/blob/main/LICENSE),
[FFmpeg build-dependent licensing](https://ffmpeg.org/legal.html), and
[Node.js license/dependency notices](https://github.com/nodejs/node/blob/v25.8.1/LICENSE).
The final packaged Node version, launcher and preprocessing choices remain open until later
Activity 05 steps; this document does not choose them or the final STT model.
