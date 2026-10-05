# Local transcription: browser and language support

## Learner report and reproduced cause

The learner confirmed real recording works in Read Aloud and Repeat Sentence,
while local transcription availability fails in Chrome and Edge on Pop!_OS.
Recording success alone does not establish on-device STT capability.

On 2026-10-05, native probes on Pop!_OS 24.04 LTS reproduced a mismatch in the
adapter: availability and installation required `quality: 'dictation'`, but the
recognition instance used the browser's default quality. The
[Web Speech API specification](https://webaudio.github.io/web-speech-api/)
defines the default as `command`; availability is specific to the requested
quality. Different quality levels can require different local models.

| Browser, native Linux/headless profile | Language | Default / command | Dictation / conversation |
| --- | --- | --- | --- |
| Chrome 154.0.8037.97 | en-AU | downloadable | unavailable |
| Chrome 154.0.8037.97 | en-US | downloadable | unavailable |
| Edge 154.0.4258.53 | en-AU | unavailable | unavailable |
| Edge 154.0.4258.53 | en-US | unavailable | unavailable |

The earlier hypothesis that en-AU alone caused the failure was insufficient:
Chrome actually reports both languages downloadable with default options.

## Correction

Availability and installation now use `{ langs: [language], processLocally: true }`,
matching recognition's browser-default quality. No higher-quality model is required
by a precheck that differs from the actual recognition configuration. Local
processing remains mandatory; no remote fallback was introduced.

RA and RS expose an explicit choice of English (Australia) or English (United
States), retaining en-AU as the default. This chooses recognition language, not
passage wording, scoring rules or an accent target. Switching clears the previous
transcript and cached availability. Busy operations block language selection;
waveform timing remains independent. Saved-ID guards still prevent duplicate saves
of the same recording after changing language.

The shared panel distinguishes unsupported, unavailable, downloading, downloadable
and available. Installation always requires the learner's explicit action.

## Verification and remaining limitations

After the correction, the actual Chrome UI in BOTH RA and RS showed
`Install local speech pack` after checking en-AU, without injected adapter results.
No real pack was installed in this validation and no real speech was transcribed.
Edge remained unavailable in the tested profile; this change cannot supply a
capability the browser does not expose. The
[Microsoft documentation](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api)
describes Edge's platform/channel/feature requirements.

A regression test covers a downloadable default model with unavailable dictation
quality, and explicit installation options match availability options. All 160
tests, build and lint passed. No dependency, schema or scoring change was needed.

For the next live test, reload the app in Chrome, Check local availability, then
click Install local speech pack if offered. After installation, record and
Transcribe locally. Availability alone does not establish recognition accuracy or
complete the real recorded-audio quality gate. Activity 04 closure remains pending
that test and the remaining live timing checks.
