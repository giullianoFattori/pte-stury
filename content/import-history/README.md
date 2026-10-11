# Import provenance history

Successful authoring batches write `<batch-uuid>.json` with declared source, safe
input basename, timestamp, item IDs and an optional safe provenance note. Commit
these records with the append-only permanent ID registry and canonical draft files.
Do not include secrets, private paths, learner identities or copied raw input here.
No production import has been performed in 06.07; tests use isolated temporary roots.
