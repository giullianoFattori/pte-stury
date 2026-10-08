#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec node "$ROOT/tools/local-stt/scripts/transcribe-test.mjs" "$@"
