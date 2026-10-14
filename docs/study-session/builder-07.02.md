# Activity 07.02 — Session builder and selection

Status: **COMPLETE** within the selection/read-only preparation scope. Activity 07
is still in progress. No session is saved, no UI is added and no scoring, speech,
content sync, learner history, database version/index or exercise route is changed.

## Boundaries and API

`buildStudySession({ request, candidates, sessionId, startedAt, contentVersion,
rng })` is the pure domain entrypoint. It imports no Dexie, filesystem, clock,
UUID generator or hidden randomness. Its result comes through the existing
`createStudySession()` lifecycle validator and has frozen config/arrays.

`prepareStudySession(request, deps)` is the asynchronous application boundary.
Dependencies provide a read-only `StudyItemSource.queryPracticeItems`, catalog
version, ID generator, clock and RNG. It queries selected tasks and optional global
difficulties in one call **without a limit**: truncating a pool to the requested
count would bias selection and misrepresent capacity. Counts come from candidate
buckets, not a second database query. There is no concrete repository singleton
import, outcome access or write method. Invalid requests fail before dependencies
run; the validated request is copied before awaiting the source, so a caller
mutation cannot change the selection after query dispatch.

The caller supplies a catalog version coherent with the pool. Transactional
catalog/session consistency and one-active-session enforcement remain 07.03.
Preparation produces a plan object, not an installed/persisted session.

## Mode contract

| Mode | Count | Task scope | Difficulty |
| --- | --- | --- | --- |
| Quick | fixed 5 | all implemented tasks, use available capacity | unrestricted |
| Task | explicit integer 1–500 | exactly one selected task | optional global filter |
| Mixed | explicit integer 1–500 | at least two selected tasks | optional global filter |

Quick accepts an omitted count or explicit `itemCount: 5`. It rejects taskTypes and
difficulties overrides, including explicitly supplied undefined fields. Callers
use `{ mode: 'quick' }`. There is no preference lookup or configurable Quick mode.
Task/Mixed do not silently choose a default count. The 500 bound is the existing
application session guardrail, not an official PTE limit.

`validateBuildRequest(unknown)` rejects unknown fields, accessors/non-plain input,
unknown modes/tasks, duplicate tasks/difficulties, empty supplied filters, malformed
primitive types and invalid counts/mode cardinality. The authoritative 07.01 config
parser validates task/difficulty vocabulary and count bounds. Selected tasks are
ordered canonically, independently of caller order:

1. write-from-dictation
2. repeat-sentence
3. read-aloud

## Eligible pool and deterministic allocation

The application source is the Activity 06 practice query interface. The pure core
also reuses `practiceItemPredicate` with selected tasks/difficulties for defensive
filtering of supplied candidate arrays; it does not duplicate lifecycle or local
availability policy. Legacy eligibility is preserved by the same predicate.
Eligible duplicate IDs fail as `SESSION_BUILD_FAILED`, never inflate capacity or
trigger last-row-wins. Candidate ID/task/difficulty metadata is checked using the
existing query validation and registered prefix map. Technical draft fixtures,
retired and unavailable rows cannot become candidates through this query rule.

Buckets are copied and sorted by the existing deterministic repository comparator
(task, difficulty ascending, ID ascending). No candidate objects or input arrays
are modified. Allocation is calculated on unique matching rows, with no constants
for today's WFD/RS/RA counts.

For N questions and T selected tasks:

```text
base = floor(N / T)
remainder = N % T
first remainder tasks in canonical order receive +1
cap each target share at actual task capacity
redistribute deficit one slot per canonical task with spare capacity
repeat canonical passes until deficit is zero
```

Examples:

| N | Capacities WFD/RS/RA | Final allocation WFD/RS/RA |
| ---: | --- | --- |
| 5 | 5 / 6 / 6 | 2 / 2 / 1 |
| 10 | 5 / 6 / 6 | 4 / 3 / 3 |
| 10 | 2 / 6 / 6 | 2 / 4 / 4 |
| 6 | 1 / 5 / 5 | 1 / 3 / 2 |
| 5 | 0 / 8 / 8 | 0 / 3 / 2 |

Zero-capacity selected tasks remain in request config but contribute no queue
items. Task mode has no cross-task capacity. Quick never shrinks below five.
If total selected capacity is insufficient, allocation fails before sampling:

```ts
error.code === 'INSUFFICIENT_CONTENT'
error.details === {
  requested: 10,
  available: 8,
  byTask: {
    'write-from-dictation': 2,
    'repeat-sentence': 3,
    'read-aloud': 3,
  },
}
```

Details and byTask are frozen copies. All implemented task keys are present;
unselected tasks are zero. The error never includes private paths or content text.

## Sampling and sequencing

`sampleStudyItems(bucket, allocation, rng)` samples each bucket separately in
canonical task order. The RNG must be injected; no Math.random fallback exists.
Invalid random values or thrown sampler errors become controlled
`SESSION_BUILD_FAILED` issues. A production caller may pass Math.random at the
outer boundary. Statistical fairness and adaptive selection are not claimed.

Selected IDs are interleaved round-robin WFD→RS→RA, preserving sampled order inside
each bucket. A 4/3/3 allocation yields:

```text
WFD RS RA WFD RS RA WFD RS RA WFD
```

When only one bucket has remaining items, same-task repetitions are allowed.
There is no extra sequencing heuristic. `allocateTaskCounts()` exposes immutable
allocation diagnostics; these are not persisted redundantly into the session.
The final queue validates length, unique IDs and allocation cardinalities before
calling `createStudySession`. Existing lifecycle checks validate identity, allowed
tasks, timestamp, content version and initial progress.

Same semantic pool, request, RNG sequence, ID/time and catalog version produce the
same IDs even if candidate/input task order differs. Different RNG can change
within-task choices while preserving allocation and interleaved task pattern.

## Queue versus requested task scope

New builder `session.taskTypes` lists **actually used** tasks in canonical order.
`config.taskTypes` stores selected request tasks for Task/Mixed; Quick stores used
tasks. The lifecycle now accepts used tasks as a subset of configured selection
and validates mode cardinality using config selection. This deliberate 07.02
refinement handles Mixed count=1 or a selected task with no matching capacity.
Older valid 07.01 domain objects remain accepted; no stored row is rewritten.

For example, Mixed requesting WFD+RA with count=1 can produce:

```text
session.taskTypes = [write-from-dictation]
config.taskTypes = [write-from-dictation, read-aloud]
```

Progress and completion still work through the existing lifecycle. The original
requested modes/task scope are retained rather than silently converting Mixed to
Task. Content version, session ID and start time are passed through from injected
inputs; the pure builder reads no build files and performs no save.

## Evidence and reproduction

55 builder tests cover fixed Quick, explicit Task/Mixed, canonical sorting,
allocation/remainder, capacity redistribution, shortages with metadata, partial
mixed task coverage, global difficulties, eligibility, duplicate/malformed source
rows, RNG errors, immutability, service boundaries and asynchronous request
snapshotting. Integration uses the actual canonical 17-item bank and the real
practice repository over isolated fake-indexeddb:

- Quick 5 succeeds with 2/2/1.
- Task WFD 5 succeeds; WFD 6 fails.
- Task RS 6 succeeds.
- Mixed 10 succeeds with 4/3/3.
- Difficulty-filtered behavior matches actual catalog capacity.
- Preparation leaves every database table unchanged and saves zero sessions.

Synthetic candidate profiling during the full Node regression suite:

| Candidates | Allocation ms | Sampling ms | Interleave ms | Complete builder ms |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.049 | 1.977 | 2.125 | 29.649 |
| 5,000 | 0.045 | 3.367 | 0.903 | 114.743 |

Complete builder includes request/candidate validation, filtering, bucket sorting,
sampling and lifecycle validation. These are single-run Node measurements during
concurrent tests, not browser/IndexedDB latency or acceptance thresholds. Synthetic
rows are never authored, reserved or installed into the production catalog.

```bash
npm test              # 755 PASS
npm run build         # PASS; existing Vite chunk advisory remains
npm run lint          # PASS
npm run package:test  # 7 PASS
git diff --check      # PASS
```

No browser/package-specific session certification is claimed or needed here:
nothing is routed or persisted yet. Next: **07.03 — Session Persistence + Resume /
Recovery**, including atomic outcomes/progress, current-row optimistic concurrency,
active-session enforcement and missing-item handling.
