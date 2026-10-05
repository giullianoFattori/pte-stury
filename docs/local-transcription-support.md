# Local transcription: browser and language support

## Learner report

The learner confirmed real audio recording works in both Read Aloud and Repeat
Sentence. Checking local transcription availability in Chrome and Edge instead
shows unavailable. Their OS/browser versions have been requested and remain
unknown; recording success alone does not establish on-device STT capability.

## Identified integration issue

The app initially exposed only en-AU and displayed the same general message for
unsupported API, unavailable language pack and download-in-progress conditions.
The Web Speech API group's [on-device explainer](https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md)
lists en-US among Chrome's supported local languages, without en-AU. The
[Microsoft Edge documentation](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api)
also lists en-US rather than en-AU, and currently documents the local feature in
Edge Dev/Canary with its on-device Speech Recognition flag enabled. Browser,
platform, policy and model-quality availability still require a runtime check.

RA and RS now expose an explicit recognition-language choice: English (Australia)
or English (United States). The original default remains en-AU; no language is
silently switched. The selected language goes to availability, installation and
recognition. This chooses a speech model, not passage wording, scoring rules or an
accent target.

Switching language clears the previous transcript and cached pack availability
and returns to idle; an explicit Check is required. Busy checks/installs/
transcription and page-disabled operations block selection. Waveform analysis is
independent and remains available; transcript-dependent WPM disappears until a
new usable transcript. Existing saved-ID guards prevent another save of the same
recording merely because its recognition language changed.

The panel now distinguishes:

- Unsupported: required local recorded-audio APIs are absent.
- Unavailable: the selected local pack/capability is unavailable.
- Downloading: pack download is in progress; Check can be repeated.
- Downloadable: show Install; no automatic installation.
- Available: local transcription is ready.

`processedLocally = true`, exact-recorded-Blob processing and no cloud fallback
remain enforced. No new dependency, schema or scoring change is introduced.

## Verification and limitations

In the actual Edge 154.0.4258.53 Linux/headless test profile, the native adapter
reported unavailable for BOTH en-AU and en-US. No actual model download was
attempted. Therefore the selector repairs the app's language restriction and
clarifies diagnosis; it does not make an unsupported browser capable of STT.

Controlled browser checks passed for selected-language availability/install,
explicit installation only, unsupported/unavailable/downloading presentation,
busy selection guard, transcript invalidation, RA save/duplicate protection and
RS using the same shared controls. Native MediaRecorder and Web Audio remained
functional. Existing tests, build and lint passed. Temporary instrumentation was
outside source and removed after verification.

After updating the app, select English (United States) and Check. If downloadable,
use Install explicitly. If unavailable/unsupported persists, capture OS and exact
Chrome/Edge version and check the browser's documented local capability/feature
configuration. Do not substitute a remote recognizer to make the check succeed.
Full real recorded-audio local transcription remains unvalidated and Activity 04
closure remains pending.
