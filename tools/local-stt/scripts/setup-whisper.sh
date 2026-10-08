#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNTIME="$ROOT/.local-runtime"
CHECKOUT="$RUNTIME/whisper.cpp"
MODEL="${1:-base.en}"
case "$MODEL" in
  base.en) HASH=137c40403d78fd54d454da0f9bd998f78703390c ;;
  small.en) HASH=db8a495a91d927739e50b3fc1cc4c6b8f6c2d022 ;;
  *) echo 'Only base.en and small.en are allowed.' >&2; exit 1 ;;
esac
for tool in git ffmpeg ffprobe c++ make sha1sum; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done
CMAKE="${CMAKE_BIN:-cmake}"
if ! command -v "$CMAKE" >/dev/null; then
  CMAKE="$RUNTIME/cmake-package/cmake/data/bin/cmake"
fi
[[ -x "$CMAKE" ]] || command -v "$CMAKE" >/dev/null || { echo 'Install CMake or set CMAKE_BIN.' >&2; exit 1; }
mkdir -p "$RUNTIME/models"
if [[ ! -d "$CHECKOUT" ]]; then
  git clone --depth 1 --branch v1.8.3 https://github.com/ggml-org/whisper.cpp.git "$CHECKOUT"
fi
# Pin the source; never silently build an arbitrary existing checkout.
EXPECTED_REVISION=2eeeba56e9edd762b4b38467bab96c2517163158
[[ "$(git -C "$CHECKOUT" rev-parse HEAD)" == "$EXPECTED_REVISION" ]] || { echo 'Unexpected whisper.cpp revision.' >&2; exit 1; }
PATCH="$ROOT/tools/local-stt/scripts/server-poc.patch"
if [[ -z "$(git -C "$CHECKOUT" status --porcelain)" ]]; then
  git -C "$CHECKOUT" apply --unidiff-zero "$PATCH"
else
  [[ "$(git -C "$CHECKOUT" status --porcelain)" == ' M examples/server/server.cpp' ]] || { echo 'Unexpected whisper.cpp source changes.' >&2; exit 1; }
  git -C "$CHECKOUT" diff --binary --unified=0 -- examples/server/server.cpp | cmp - "$PATCH" || { echo 'Unexpected server patch.' >&2; exit 1; }
fi
"$CMAKE" -S "$CHECKOUT" -B "$CHECKOUT/build" -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_SERVER=ON -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DCMAKE_CXX_FLAGS=-DCPPHTTPLIB_PAYLOAD_MAX_LENGTH=12582912
"$CMAKE" --build "$CHECKOUT/build" --parallel "${BUILD_JOBS:-4}" --config Release --target whisper-cli whisper-server
bash "$CHECKOUT/models/download-ggml-model.sh" "$MODEL" "$RUNTIME/models"
printf '%s  %s\n' "$HASH" "$RUNTIME/models/ggml-$MODEL.bin" | sha1sum --check
sha256sum "$RUNTIME/models/ggml-$MODEL.bin"
