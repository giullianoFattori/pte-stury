# Runtime resilience validation

These tools are test-only. Production `runtime:start` does not import fixture launchers, artifact overrides, GC controls, modes or fake transcription. Stress uses synthetic PCM and a controlled CLI artifact with production HTTP, temp storage, real ffmpeg/ffprobe and the real `createWhisperService` lifecycle. It validates service ownership, not learner accuracy, full Whisper load cost or model RAM.

```bash
npm run runtime:stress:restart       # 20 start-ready-transcribe-stop cycles, same port/root
npm run runtime:stress:transcribe    # 100 sequential requests after 20 warmups
npm run runtime:stress:slow          # real production slow-header/body/socket deadlines (~40s)
npm run runtime:audit:network        # Linux strace instrumentation on native decoders
node tools/runtime-hardening/lifecycle-audit.mjs # ss/ps during abort and timeout
node tools/runtime-hardening/native-smoke.mjs    # separate real base.en child RSS, controlled TTS only
node tools/runtime-hardening/build-audit.mjs     # requires saved /tmp/pte-0508-npm-audit.json
```

Results are written to `runtime/docs/audits/` with counters only. Long validation is separate from `npm test`. Fixtures have generated private temp paths and are removed in `finally`; the runtime cleans each request before returning success. Scripts assert empty request temp directories, no active direct native child, native PID disappearance, exact return of FD count to the warmed baseline, structured private-data-free logs and successful next requests. Parent RSS is measured through `/proc`; explicit GC is enabled only in the test parent to distinguish live retention from allocator high water. Review the plateau/trend; no arbitrary model-specific RAM threshold is imposed. Stress launchers block parent Node outbound APIs. The network audit traces actual ffmpeg/ffprobe network syscalls with denied HTTP/HTTPS/TCP/UDP inputs; this does not provide OS sandboxing.

Use the separate human corpus benchmark for real Whisper/model latency, memory and WER. Step 05.09 must repeat these checks on each packaged OS/backend and verify Windows Job Object/launcher child-tree ownership. Native code that deliberately escapes its process group is outside this Linux lifecycle claim.
