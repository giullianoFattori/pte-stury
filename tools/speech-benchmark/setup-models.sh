#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# Fixed official sources and pinned engine; no arbitrary URLs or model IDs.
for model in base.en small.en; do
  bash "$ROOT/tools/local-stt/scripts/setup-whisper.sh" "$model"
done
node --input-type=module -e "import { verifyModel } from './tools/speech-benchmark/models.mjs'; for (const id of ['base.en', 'small.en']) console.log(await verifyModel(id));"
