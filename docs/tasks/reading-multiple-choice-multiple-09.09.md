# Activity 09.09 — Reading Multiple Choice Multiple Answers

Five authored Reading passages (up to 350 words) provide multiple correct options and stable option IDs. There is no separate timer. Each correct selection earns one point, each incorrect selection loses one point, and item points are floored at zero. Attempts persist canonical option IDs in `responseData.kind = 'multiple-choice'`; summary precision and recall are calculated from aggregate counts.

## Validation status

On 2026-11-09, build and lint passed; package tests passed 7/7. After updating task counts and fixtures, the complete test suite passed 1,222 tests. The standalone task browser flow, Mixed Practice browser test (17 ready tasks, 82 items), and session summary browser test passed. The task browser check covers standalone selection and persistence; it does not establish packaged application behavior.
