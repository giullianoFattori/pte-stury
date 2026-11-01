# Reorder Paragraph — Activity 09.05

## Contract

Pearson PTE Academic Reorder Paragraph is a Reading task. The displayed text is up to 110 words, has no separate response timer, and awards one point per correctly ordered adjacent pair, with a minimum item score of zero. The app stores an internal normalized practice metric, not an official Reading section score.

## Implementation

Five original active items use stable block IDs and authored complete orders. Published content validation enforces at least three non-empty blocks, a complete unique order, and no more than 110 words. The initial list uses a seeded deterministic shuffle based on item and attempt identity; if the shuffle matches the answer, it is rotated. Retry uses a new deterministic seed.

Learners can reorder with keyboard-operable Move Up and Move Down buttons. The response persists only the ordered block IDs using `responseData.kind = 'ordered-blocks'`. The scorer awards +1 for each adjacent pair present in the authored adjacency set; `Attempt.score` is correct pairs divided by `block count - 1`.

Attempts produce at most four adjacency errors and three contextual review items. The session summary pools correct and total adjacent-pair counts before computing accuracy. No audio, speech runtime, timer, or external service is used. Quick Practice remains WFD / RS / RA.

## Evidence

Validation on 2026-11-01:

- Content validation/build/verify passed with 61 active items and five Reorder Paragraph items; generated content version is `sha256:22feed158802449a5395270e7a0a1a0f89dc26532dacf8a27d7fae59ce629f4f`.
- All 28 audio assets and four image assets passed their integrity checks.
- `npm test -- --test-concurrency=1`: 1,195 tests passed; build and lint passed; all seven package tests passed.
- Chrome 154 browser flow passed standalone submit/save, Move Up/Down through keyboard focus plus Enter/Space, five-question Task Practice and summary, and Mixed Practice transitions Dropdown → Drag and Drop → Reorder. It reported zero page errors and zero unexpected remote requests.
- Linux package rebuilt from this content version. Internal host smoke passed with 94 artifacts, 13 standalone SPA routes, 61 learner items, local assets, and the existing packaged local Whisper technical path. This is not clean-machine or cross-platform certification.
- Dexie remained v3; content schema remained v2; Quick Practice remained WFD / RS / RA.

No official PTE score equivalence is claimed.
