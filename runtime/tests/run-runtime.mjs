// Shell/security subprocess tests use a deterministic internal engine dependency.
// Real native integration is verified separately; no downloaded model is needed
// to run the normal suite. This wrapper is never used by runtime:start.
import { main } from '../src/main.mjs';
import { createWhisperService } from '../src/whisper.mjs';
const artifacts = process.env.PTE_TEST_ENGINE_ARTIFACTS ? JSON.parse(process.env.PTE_TEST_ENGINE_ARTIFACTS) : null;
await main(process.argv.slice(2), { initializeEngine: artifacts ? opts => createWhisperService({ ...opts, artifacts }) : async () => ({
  transcribeNormalizedAudio: async () => ({ text: 'Controlled local audio.', inferenceMs: 0 }),
}) });
