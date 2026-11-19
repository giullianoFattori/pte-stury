# LMCM audio authoring prototype

This is an authoring-only comparison. It does not change the runtime or production LMCM items. Human listening approval is required before selecting a profile or generating replacements.

## Prototype

`lmcm-000001-prototype.txt` is a spoken rewrite of the first item. The original options remain supported or unsupported as authored: cooling through shade and water, and assessment through survival and canopy cover are supported; the three distractors are contradicted or unsupported. This is a text review, not a substitute for listening QA.

Generate both candidates with Piper 1.3.0 and the `en_US-ljspeech-medium` model and JSON config from the Piper voices `v1.0.0` tag. Supply the paths explicitly:

```sh
PIPER_PYTHONPATH=/path/to/piper-python-packages \
PIPER_MODEL=/path/to/en_US-ljspeech-medium.onnx \
PIPER_CONFIG=/path/to/en_US-ljspeech-medium.onnx.json \
bash tools/audio-authoring/synthesize-prototype.sh
```

Candidate A uses length scale 1.05 and 0.40 seconds of sentence silence; B uses 1.15 and 0.55 seconds. Both are normalized with FFmpeg loudnorm and encoded to mono 24 kHz MP3. Compare the same full recording without reading the transcript first. The script retains WAV intermediates for inspection. Piper handles sentence segmentation; this prototype does not separately control paragraph pauses or implement pronunciation overrides.

## Provenance and licensing review

The model card is at https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/ljspeech/medium/MODEL_CARD and identifies LJSpeech as its training dataset and public domain as the dataset license. That alone does not establish every right in the model or generated audio; review the model and output terms before publishing production assets. Piper's engine is GPL-3.0-or-later according to https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md. It is used only in an external authoring environment here and is not bundled into the app.

Measurements, hashes, and pending human review are recorded in `audits/audio-authoring/lmcm-000001-prototype.json`.
