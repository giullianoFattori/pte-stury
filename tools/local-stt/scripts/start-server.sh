#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
MODEL="${1:-base.en}"
case "$MODEL" in
  base.en) HASH=137c40403d78fd54d454da0f9bd998f78703390c ;;
  small.en) HASH=db8a495a91d927739e50b3fc1cc4c6b8f6c2d022 ;;
  *) echo 'Unsupported model' >&2; exit 1 ;;
esac
printf '%s  %s\n' "$HASH" "$ROOT/.local-runtime/models/ggml-$MODEL.bin" | sha1sum --check
echo "Starting local whisper-server with $MODEL at 127.0.0.1:8765 (transcript stdout discarded)."
# Disable server conversion: only the bridge performs conversion with argument arrays.
exec "$ROOT/.local-runtime/whisper.cpp/build/bin/whisper-server" \
  --host 127.0.0.1 --port 8765 -l en -ng -t 4 \
  -m "$ROOT/.local-runtime/models/ggml-$MODEL.bin" > /dev/null
