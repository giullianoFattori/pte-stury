# Activity 06.05 — Practice metadata queries

This step adds selection infrastructure only. Bootstrap still seeds the 17 legacy
questions; real-content migration, study sessions, ranking, mastery and review UI
are unchanged. Dexie remains version 3 with the existing taskType/difficulty indexes.

## Contract and validation

`StudyItemQuery` supports taskTypes, difficulties, skills, tags, topic, excludeIds,
matchSkills, matchTags and limit. Repository query/count methods accept dynamic
input and validate it with `parseStudyItemQuery()` before any database access.
Callers can use the exported readonly type for authored queries.

```ts
const query: StudyItemQuery = {
  taskTypes: ['repeat-sentence'],
  difficulties: [2, 3],
  skills: ['listening', 'speaking'],
  matchSkills: 'all',
  tags: ['academic'],
  excludeIds: ['rs-000001'],
  limit: 20,
};
const candidates = await studyItemsRepository.queryPracticeItems(query);
const totalAvailable = await studyItemsRepository.countPracticeItems(query);
```

Omitted fields mean no filter. Provided **positive filter** arrays (taskTypes,
difficulties, skills, tags) that are empty mean no matches, including in all mode.
Empty excludeIds means no exclusions: it is a negative filter, not a request for
an empty candidate set. This exception is explicit rather than inferred from an
empty array's truthiness. Exact unknown-but-valid tag/topic values return no matches.

Match defaults are `any` for skills and tags. `any` requires intersection; `all`
requires every requested value. Different filter dimensions are combined with AND.
Tags and topics preserve authored case, whitespace and Unicode: `Academic` differs
from `academic`; no trimming, stemming, fuzzy matching or Unicode normalization
occurs. Skills use only listening/reading/speaking/writing; missing legacy skills
are never inferred from task type. Exclusions compile once into a Set.

Limits are positive safe integers 1–500. A query applies limit **after** filtering
and deterministic ordering. Counts validate the entire query but ignore a valid
limit, reporting total matching availability. They still reject limit 0/501/etc.
An omitted limit returns all matching candidates; future session callers should
request bounded results or deliberately retrieve their filtered sampling pool.

Validation rejects unknown fields, non-data/prototype/accessor objects, invalid
task/difficulty/skill values, duplicate array entries, sparse/extra/custom arrays,
nonstring/blank/overlong tags/topics, invalid modes and limits. Explicit undefined
fields are invalid; omit them instead. Optional omitted query defaults to `{}`.
Errors are `StudyItemQueryError` with structured path/code/message issues; they are
different from a valid query returning `[]`/count 0. Strings are copied unchanged;
parsed arrays/objects are frozen and input is not mutated.

Array budgets: three tasks, five difficulties, four skills, 50 tags and 10,000
exclusions. Tags/topic/IDs reuse content safety length limits. Exclusion IDs use
the explicit 17 historical IDs or valid supported six-digit nonzero IDs; nonexistent
valid IDs are allowed. Paths, new short IDs, traversal and unsupported prefixes
are rejected. Validation does not allocate IDs or verify that an exclusion exists.

## Eligibility and historical access

Every query, count and coverage diagnostic uses the existing `isPracticeEligible()`:
the grandfathered unversioned live bank, or positive known versioned metadata with
authored active lifecycle and catalogAvailable true. Draft, retired and unavailable
rows are excluded. The three technical `*-900001` drafts are not practice candidates.
The current 17 remain queryable by task/difficulty and legitimately lack metadata.

Historical/admin `getById()` and `getAll()` remain unfiltered, allowing old attempts
and reviews to resolve identities. `getByTaskType()` delegates to the practice query
and now shares its deterministic order. Repository methods can be extracted without
depending on `this`. `createStudyItemsRepository(database)` supplies test isolation;
the exported singleton continues to use the existing app database.

## Ordering and query execution

Default order is canonical task order (WFD, RS, RA), difficulty ascending, then ID
ascending with locale-independent string comparison. IndexedDB insertion order
and filter array order do not affect results. No repository method randomizes rows.

If taskTypes is supplied, candidate selection uses that index; otherwise a supplied
difficulty filter uses difficulty. A single key uses equals; multiple keys use anyOf.
Remaining filters/eligibility are applied in the Dexie collection before returning
rows. Task selection takes precedence when both indexes could be used. Metadata-only
queries scan the collection; there is no metadata index or speculative cache.
The repository materializes only matched candidates to sort them and apply the
limit; it cannot stop the index cursor early because that could change the ordering.
Filtering a large catalog in React is unnecessary. Count uses the filtered collection
count, and coverage/grouped counts use cursor iteration rather than loading arrays.

No schema bump, compound metadata index or multiEntry tag/skill index is justified
by simulated timings alone. Profile actual supported browsers after real-content
migration before changing index design.

## Counts and metadata coverage

- `countPracticeItems(query)` gives total matches, ignoring limit.
- `countPracticeItemsByTaskType()` includes every implemented task, even at zero.
- `practiceMetadataCoverage()` reports eligibleItems, missingSkills, missingTags
  and missingTopic. Empty arrays/blank topics count as missing. Legacy incompleteness
  is informational, not corruption or a reason to infer metadata.

These are read-only operations. No Attempts/Errors/Reviews/Sessions/contentState
are written, and no availability or lifecycle is changed.

## Pure sampling

`sampleStudyItems(items, count, rng)` performs partial Fisher–Yates on a copied array.
The RNG is mandatory; persistence contains no Math.random call. Same candidate order
and RNG sequence produce the same sample order. The helper does not reorder/mutate
input or item fields; returned items retain their object references.

Count is a nonnegative safe integer within candidate count; zero returns `[]` without
calling RNG. A requested oversize sample fails rather than silently shrinking.
Candidates must have unique IDs; duplicates are rejected rather than selecting
multiple references to one question. RNG values must be finite numbers in `[0,1)`.
The helper does not decide eligibility, rank, seed policy or statistical quality:
callers pass repository candidates and an appropriate RNG. Sessions are deferred.

## Validation and scale evidence

The dedicated suite covers filters, exact case, empty arrays, exclusions, limit/count
parity, ordering, index selection, eligibility, historical lookup, legacy metadata,
structured invalid queries, copying and deterministic sampling. Synthetic 1,000 and
5,000-row banks measure task-only, difficulty, combined metadata, count and sample
operations; none become production questions. Measurements are emitted as test
diagnostics with timings in milliseconds. They use real Dexie over fake-indexeddb,
not browser performance truth, and have no arbitrary latency pass threshold.

```bash
npm run content:build
npm run content:verify
npm test
npm run build
npm run lint
npm run package:test
git diff --check
```

Actual browser/storage/startup profiling is still pending scale validation in 06.08.
Audio integrity/decode, authoring/import tools, new tasks, migration, study-session
generation and adaptive/review features are outside this step. Activity 05 release
and human-model quality gates remain unchanged.

## Results — 2026-10-11 (Australia/Sydney)

All 541 app/runtime tests passed, including 73 dedicated query cases; all five
package tests passed. The same 73 cases passed with packaged Node 24.21.0 LTS.
Content build/verification, frontend build, lint and diff checks passed. Dexie
remains v3, and the generated bundle/hash is unchanged. No production question,
scoring or bootstrap migration was performed.

[Archived scale measurements](query-06.05-scale.json) contain both the development
full-suite run (with concurrent test load) and the isolated LTS run. Each operation
was measured once after bulk insertion; no fastest-run selection or latency gate
was applied. The combined filter matched 68/334 rows in the 1,000/5,000-item banks.
Query limits were 100 for task/difficulty, 20 for combined metadata; counts ignored
that limit, and sample selection drew 10 of the task candidates.

| Isolated Node 24 / fake-indexeddb | 1,000 items | 5,000 items |
| --- | ---: | ---: |
| Task query (ms) | 76.600 | 1,025.649 |
| Difficulty query (ms) | 20.481 | 310.356 |
| Combined query (ms) | 55.730 | 1,062.019 |
| Count (ms) | 46.002 | 1,040.830 |
| Sample selection (ms) | 0.113 | 0.035 |

The simulator spends substantial time walking filtered cursors at 5k; this is
not evidence that those latencies will occur in a supported browser, nor evidence
that browser latency is acceptable. Actual browser profiling remains open before
deciding whether a new index/schema is warranted.
