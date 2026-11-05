# Write Essay — Activity 09.07

Implemented and validated 2026-11-05.

## Task contract

Pearson PTE Academic Write Essay is in Speaking & Writing and assesses Writing. The learner responds to a 2–3 sentence argumentative prompt in 20 minutes; the target is 200–300 words. The current Score Guide describes Content, Form, Development/Structure/Coherence, Grammar, General Linguistic Range, Vocabulary Range and Spelling. This app does not reproduce those trait scores.

The local Form estimate awards 2 points at 200–300 words, 1 point at 120–199 or 301–380 words, and 0 outside those ranges. All-capital responses, no punctuation, list-only responses and a conservative all-very-short-sentences pattern override the word band to zero. This is a local heuristic, not a linguistic determination of Pearson Form.

## Product behavior

The 20-minute countdown begins only after **Start question**. On timeout, the text remains, the editor locks, and the learner explicitly saves. The textarea is controlled, retains paragraph breaks, and disables browser spellcheck/grammar assistance. No draft or raw response is stored until the learner saves an Attempt.

Five original prompt items cover agree/disagree, discuss-both, advantages/disadvantages, problem/solution and open argument. Authored key requirements are evaluated with the shared lexical coverage helper. Results are described as **Prompt requirements detected** and do not assess reasoning quality, factual correctness or nuanced relevance. The optional outline is a planning example revealed after submission.

Structure feedback reports paragraphs, average paragraph length, an introduction-like opening, conclusion signal, and common transition phrases. Mechanics report capitalization, terminal punctuation, sentence count and duplicate punctuation. These are descriptive checks, not Pearson Grammar, Development, Vocabulary or Spelling scores.

The internal Attempt score is exactly:

```text
requirementCoverage × formCredit
```

Form 2 has credit 1, Form 1 has credit 0.5, and Form 0 has credit 0. The session summary pools matched and total requirements and reports Form counts, average words/paragraphs, and timeouts. It is not an official PTE Writing score.

## Persistence and integration

Write Essay uses the existing `write-essay` typed `taskData` contract, shared word counter, standard Attempt/ErrorRecord/ReviewItem persistence, the session exercise dispatcher, Task Practice, Mixed Practice, and an explicit task-summary variant. It is practice-ready; Quick Practice remains WFD / RS / RA. Content schema remains v2 and Dexie remains v3.

## Validation evidence

- Five active Write Essay items; **71 active learner items** across the bank. Final content version: `sha256:a298bfcb7bbebc2d7a7d7c2e750ae6c1d38db9e5aabb596c66d8134cba2be4bd`.
- Content validation and build pass. Audio integrity passes for all 28 referenced audio assets; image integrity passes for all 4 referenced image assets. Schema v2 and Dexie v3 remain unchanged.
- `npm test`: **1,212 passed**. `npm run runtime:test`: **49 passed**. `npm run package:test`: **7 passed**. Build, lint and `git diff --check` pass. Vite retains its existing warning that the main JavaScript chunk exceeds 500 kB.
- Chromium 154 standalone/Task Practice browser flow passes with fake-clock timeout; it confirms saved Attempt metrics, preserved-and-locked timeout response, capacity of 5, 3-item Task Practice completion and Write Essay summary. Zero page errors or external requests.
- Mixed Practice browser regression passes with 15 ready-task choices and a 71-item Max queue; the Write Essay selector remains separate from Quick Practice. HIW's Max Mixed regression also passes with the 15-task canonical queue and 71 unique items.
- Linux x64 package rebuilt with 94 verified artifacts. Launcher smoke verifies 15 standalone routes, 71 learner items, all 28 local audio and 4 image assets, loopback runtime transcription, restart and shutdown. The packaged Write Essay browser flow separately passes standalone save, 3-item Task Practice and task summary with zero page errors/external requests; Dexie reports v3.
- The browser/package evidence is technical host evidence. Clean-machine Linux, Windows/macOS, signing, physical microphone and human benchmark gates remain separate release work.

## Limitations

There is no cloud or AI essay grader, grammar engine, validated spelling engine, or official-trait score. Requirement coverage is lexical evidence and may miss paraphrase or over-credit keyword overlap. Structure and mechanics checks are local descriptive heuristics.
