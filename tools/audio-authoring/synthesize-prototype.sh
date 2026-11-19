#!/usr/bin/env bash
set -euo pipefail
: "${PIPER_PYTHONPATH:?Set PIPER_PYTHONPATH to the directory containing the pinned piper-tts 1.3.0 installation}"
: "${PIPER_MODEL:?Set PIPER_MODEL to the en_US-ljspeech-medium ONNX file}"
: "${PIPER_CONFIG:?Set PIPER_CONFIG to the matching ONNX JSON configuration}"
output_dir="${1:-audits/audio-authoring/prototypes}"
mkdir -p "$output_dir"
for variant in a b; do
  if [[ "$variant" == a ]]; then rate=1.05; pause=0.40; else rate=1.15; pause=0.55; fi
  PYTHONPATH="$PIPER_PYTHONPATH" python3 -m piper --model "$PIPER_MODEL" --config "$PIPER_CONFIG" --input-file tools/audio-authoring/lmcm-000001-prototype.txt --output-file "$output_dir/lmcm-000001-$variant.wav" --length-scale "$rate" --sentence-silence "$pause"
  ffmpeg -nostdin -v error -i "$output_dir/lmcm-000001-$variant.wav" -af 'loudnorm=I=-19:TP=-2:LRA=11' -ar 24000 -ac 1 -codec:a libmp3lame -q:a 3 -y "$output_dir/lmcm-000001-$variant.mp3"
done
