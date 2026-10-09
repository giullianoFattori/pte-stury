# Human speech model benchmark

05.08 replaces benchmark-only spawning with production `runNative`, sharing minimal environment, bounded streams and abort/termination policy. Reports explicitly record `nativeEnvironmentPolicy: minimal-v1` in configuration and Git identity; decoding/preprocessing/WER normalization remain unchanged. Earlier results must retain their original settings/revision when compared. The human corpus and model choice remain pending.

The production default stays `base.en` until verified human recordings support a decision. Controlled/TTS audio cannot satisfy this gate. This tool uses no application storage or learner scoring and adds no model dropdown. Run on Node 22.18+ with native TypeScript support, the same ffmpeg/ffprobe and pinned whisper.cpp build as production.

```bash
npm run benchmark:speech -- --init
bash tools/speech-benchmark/setup-models.sh
# Record, listen, replay, and fill .local-benchmark/references.json first.
npm run benchmark:speech
```

Initialization creates empty private directories; it never creates fake references and refuses to overwrite a manifest. Setup uses the existing pinned v1.8.3 setup and its fixed official download source. Both upstream SHA-1 identities must match before inference; exact bytes and SHA-256 are captured locally. No arbitrary URL is accepted. Model downloads require internet; inference does not. Quantization is deferred until a full-model human comparison demonstrates a resource reason.

Store original recordings under `.local-benchmark/corpus/{ra,rs}/`. All `.local-benchmark/` content is ignored by Git. Use one source recording per sample and stable IDs. Supported containers follow production: WAV, WebM, Ogg, MP4 audio; one audio stream, no video. Production limits remain 12 MiB and 180 seconds.

Manifest shape (`manifest.schema.json`, validated by `manifest.mjs`):

```json
{
  "manifestVersion": 1,
  "samples": [{
    "id": "ra-human-001",
    "task": "ra",
    "itemId": "ra-001",
    "audioFile": "ra/ra-human-001.webm",
    "source": "human",
    "expectedText": "The library closes at nine.",
    "spokenReference": "The library closes at five.",
    "referenceVerified": true,
    "usable": true,
    "notes": { "speaker": "speaker-01", "l1": "pt-BR", "environment": "quiet-room", "pace": "normal" }
  }]
}
```

This is an illustration, not a verified sample. Listen without consulting Whisper output, transcribe the actual words, replay and verify, resolve uncertainty. If words remain unintelligible, mark `usable: false` with `exclusionReason`; never invent a reference. `expectedText` is the question answer; WER uses only `spokenReference`. Obtain consent for additional speakers, anonymize IDs and keep recordings private. No names in filenames, texts, or environment notes intended for publication.

Phase A needs at least 3 human RA + 3 human RS samples, with a Brazilian Portuguese L1 speaker, natural accent, hesitation, varying speeds and realistic microphone conditions. Six recordings permit a provisional recommendation only. Phase B targets 15+ RA + 15+ RS, more speakers and recording conditions. Include short/medium/long academic passages, numbers/dates/proper nouns, UK/Australian spellings, consonant clusters; RS also includes function words, academic terms, confusable words and genuine memory omissions. Preserve source audio; do not re-record per model.

Each sample is snapshotted read-only and preprocessed **once by production `preprocessAudio`** to 16 kHz mono PCM s16le WAV. That same WAV is passed to both models and all three repetitions; temporary audio is removed in `finally`. Source/normalized hashes are retained in private reports. Production `whisperArguments` supplies English, four threads, CPU, no timestamps, suppressed non-speech tokens, no prompt. Other CLI defaults are tied to the pinned revision. Models run sequentially with no warmup; CLI launch through exit timing includes model load, and RTF = inferenceMs/audioMs. `totalMs` also includes preprocessing, excluding benchmark-only hashing. Hardware, compiler/build, source diff hash, executable hash, engine/model hashes and Git state are recorded. Memory is sampled Linux process VmHWM every 10ms, a measured lower bound; unsupported/short-lived processes report null. Model file size is never treated as RAM usage.

Each run gets a new `.local-benchmark/results/run-*/` directory:

- `results.json`: private transcripts, references, source hashes, edit details and all repetitions.
- `summary.json`: allowlisted anonymous metrics, no transcript/reference/audio path; candidate for publication after review.
- `summary.md`: decision table and limitations, generated from the safe summary.

Primary WER always uses the first chronological repetition. All repetitions retain WER and transcript; differing transcripts set `transcriptVariants > 1` and require investigation. Per-sample latency uses the median of three; per-sample RSS uses their maximum. Corpus WER = summed S+D+I / summed reference words; mean/median/worst sample WER, RA and RS are also reported. Failed preprocessing, unavailable models, timeouts and process failures are preserved as failed rows, never zero WER. Partial runs remain private evidence. Successful-only aggregates are incomplete if any candidate fails; inspect paired complete samples and resolve failures before choosing a model. SIGINT/SIGTERM terminate the current CLI and clean temporary audio; reports checkpoint after each sample.

Baseline normalization version 1 retains the existing POC tokenizer: NFKC, apostrophe canonicalization, lowercase, selected punctuation removal and whitespace. This is lexical **raw WER**, not byte comparison. `nine` versus `9` and `behaviour` versus `behavior` remain errors. Diagnostic representation rule v1 counts only aligned one-token substitutions for zero through twelve, twenty, behaviour/behavior, organisation/organization, colour/color. No normalized-equivalence WER is claimed; multi-token numbers require manual review. Changes to this policy require a new version. RA/RS scoring is unchanged.

Review mismatches using private edit lists and audio. Keep a private ledger with sample/model/repetition, mismatch, A genuine learner error (expected vs spoken), B recognizer error (spoken vs transcript), C representation only, D ambiguous, plus content-word/negation/number/academic/function-word flags. Review repeated final consonant/TH/vowel/plural/article failures as recognizer diagnostics, not pronunciation scores. The runner does not invent this classification or a false-learner-error rate. Choose only after this review, prioritizing reliability, latency, RAM, disk size and operational cost. No arbitrary WER acceptance threshold or automatic winner is imposed. Even 30+ samples need human review before a final decision.

Optional separate hallucination samples use task `noise`, an ID such as `noise-room-001`, empty expected/reference texts, and `noiseType` from digital-silence/room-noise/hiss/breathing. They never contribute to ordinary WER; each successful run records hallucinated word count. Digital all-zero silence is rejected by the production gate and recorded as `NO_SPEECH`; it does not reach Whisper. Real noise/breathing that produces words triggers a VAD follow-up, with no premature amplitude threshold.

Before committing a completed report, inspect `summary.json`/`summary.md` for identifying content, then copy them to `runtime/docs/benchmarks/benchmark-05.07-{results.json,summary.md}` and update `runtime/docs/benchmark-05.07.md` with human-reviewed failure patterns and recommendation. Never commit `results.json` from the private directory. Preserve the base.en baseline and a private regression corpus; rerun after model, engine, preprocessing or decoding changes. Keep `base.en` support if a later decision changes the default.
