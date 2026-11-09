# Activity 09.09 — Reading Multiple Choice Multiple Answers

Five authored Reading passages (up to 350 words) provide multiple correct options and stable option IDs. There is no separate timer. Each correct selection earns one point, each incorrect selection loses one point, and item points are floored at zero. Attempts persist canonical option IDs in `responseData.kind = 'multiple-choice'`; summary precision and recall are calculated from aggregate counts.

## Validation status

On 2026-11-09, build and lint passed; package tests passed 7/7. After updating task counts and fixtures, the complete test suite passed 1,222 tests. The standalone task browser flow, Mixed Practice browser test (17 ready tasks, 82 items), and session summary browser test passed. The task browser check covers standalone selection and persistence; it does not establish packaged application behavior.

## Packaged Linux smoke — PASS

On 2026-11-09, `npm run package:linux` built the internal Linux x64 package and passed its smoke. Using the packaged launcher and Chrome, the standalone route rendered the passage and question; selecting two correct options and one distractor produced 1 / 2, and the attempt was saved in local IndexedDB. Checkbox deselection and reselection, reload, the 3/5/Max Task Practice choices, a completed three-question session, and the dedicated summary were verified. No page errors or external network requests occurred. Evidence: `audits/reading-multiple-choice-multiple-09.09-package-browser.json`.

Artifact: `PTE-Study-0.1.0-linux-x64-internal.tar.xz`; SHA-256 `9a808f3078b632f6ed4db7b3fedcb6950ff1f76dac2cf684bcf9cfbcbb0ac495`. Source HEAD was `0dd96d7f923a826459d7a8e0d900a48a7695e369`, with the package smoke update in the working tree. This is an internal host smoke; it is not clean-machine, Windows, or macOS validation.
