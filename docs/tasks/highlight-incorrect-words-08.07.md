# Highlight Incorrect Words — Activity 08.07

Verified against Pearson's [PTE Academic Listening task guidance](https://www.pearsonpte.com/pte-academic/test-format/listening/) and the [PTE Academic Test Taker Score Guide](https://www.pearsonpte.com/content/dam/ELL/pte/pearsonpte/pdfs/pte-academic-pdfs/PTE-Academic-Test-Taker-Score-Guide.pdf) on 2026-10-24. The task uses Listening + Reading, a short 15–50 second prompt, one playback, and no separate response timer. Pearson's published item arithmetic is +1 for each correctly selected discrepant word, −1 for each incorrect selection, with a minimum task score of zero.

## Implementation

Five learner-ready items (`hiw-000001`–`hiw-000005`) use local 24-second audio and stable displayed-token IDs. The recordings are excerpts from NASA-produced *Houston We Have a Podcast* episodes already used in Retell Lecture. The displayed/spoken transcript pairs were checked against the episode transcripts and locally transcribed clips. Episode sources: [Taking the Temperature of Earth](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/taking-the-temperature-of-earth/), [Space Biology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/space-biology/), [Astrobiology](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/astrobiology/), and [Moon Farming](https://www.nasa.gov/podcasts/houston-we-have-a-podcast/moon-farming/). See [NASA media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). This independent study app is not endorsed by Pearson or NASA.

The standalone and session exercise show the transcript during a 10-second skim interval, then start local audio once. Buttons remain unavailable during the skim and become toggleable during playback; the learner can make final changes after audio ends and then submit. Retry resets the attempt and grants a new single playback. Native buttons support keyboard activation and expose selection state with `aria-pressed`. No microphone, MediaRecorder, Whisper, or cloud service is used.

Selections are persisted in optional, validated `Attempt.responseData` arrays keyed by token ID. The response payload records selected, correct, false-positive, and missed IDs; it is JSON serializable and does not require a Dexie migration. `Attempt.score` is the clamped raw point total divided by the authored number of discrepant tokens. Signed raw points, clamped points, maximum points, precision, recall, and selection counts are separately persisted and integrity checked. Summary precision and recall are computed from aggregate counts rather than averages of item percentages.

Errors use `listening-decoding` only and distinguish missed discrepancies from false-positive selections. ReviewItems are capped at four and include compact context of up to three tokens on either side. Corrected audio truth and the spoken transcript appear only after submission. The numeric score follows the published item-level arithmetic; it is not a Listening/Reading section score.

## Evidence and limits

Content validation requires local audio with integrity metadata, a 15–50 second duration for active items, unique non-empty token IDs/text, at least one incorrect token, explicit one-word replacement truth, and a spoken transcript matching the authored token truth. Audio integrity verification checks the package-local clips.

Question-bank schema remains v2 and Dexie remains v3. The built bank contains 41 active items, including five HIW items; its generated content version changed to `sha256:246d400e68562495a7d492682ac53555994ef1b67266c4bd484078e70d4fde28`. Foundation revisions and existing attempt history were not rewritten.

Validation on 2026-10-24: all 1,162 application/runtime tests passed; all seven package tests passed; content validation/build/verification and audio/image integrity passed; TypeScript production build, lint and `git diff --check` passed. The HIW browser suite passed in Linux Chrome for the 10-second preview, one-play behavior, selection toggle, exact correct/false-positive arithmetic, response persistence, five-question Task Practice and its summary, and a Max Mixed queue containing all nine ready tasks in canonical order. The existing Mixed Practice browser regression also passed with all nine tasks ready and no remote requests. Both browser suites observed Dexie v3.

The Linux package was rebuilt and host smoke passed: the package served five active HIW items, both standalone and session routes, and local HIW audio; launcher/runtime checks for loopback isolation, restart, single-instance ownership and process cleanup passed. This is local host package evidence, not clean-machine or Windows/macOS certification.

The local exercise validates authored answer truth and does not certify human listening performance, audio realism, or Pearson full-test scoring. Physical-device and clean-machine certification remain separate Activity 05 gates.
