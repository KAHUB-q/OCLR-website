# Player profile relational-read latency (#913)

The organizer reported slow OCLR player profiles opened from the S9 directory.
This phase starts at main `6398c7b0a921e7f003d7cd4bbf5661d5f924f993` (PR #912).

## Public investigation

On 2026-11-06, a normal browser visit to the S9 directory and its first OCLR
profile link completed successfully. Single anonymous HTTP requests measured:

| Public route                  | Time to first byte | Total response |
| ----------------------------- | -----------------: | -------------: |
| `/tournaments/s9/players`     |            0.715 s |        0.763 s |
| `/players/9697708?edition=s9` |            1.836 s |        1.882 s |
| `/players/9755808?edition=s9` |            2.805 s |        2.883 s |

The public `/api/health` endpoint reported release
`6398c7b0a921e7f003d7cd4bbf5661d5f924f993`. These are isolated observations,
not load tests or production database traces. No production credentials,
database queries, service operations or profile refresh commands were used.

The profile reads every published season for participation, identity evidence,
timeline and edition switching. `readTournaments(true)` previously reconstructed
every archive separately, selecting its head and then each of 23 entity tables.
Ten fully normalized archives therefore required **241 SQL queries** for this
catalogue alone. Individual archive and MP snapshot reads repeated the same
per-table round trips. This is a reproducible query amplification issue in the
deployed code; its exact share of production latency requires post-deployment
measurement.

## Change and equivalence

The catalogue now reads its current pointers together and transports typed rows
with a single `UNION ALL`/`jsonb_agg` query. It still decodes every document and
compares it with the current source hash. An incomplete/stale archive falls back
independently, preserving valid relational reads for other seasons. MP snapshots
also transport their typed entity rows in one query. The database retains typed
columns, source JSONB and immutable history; query-result JSON is not a new cache.

The existing full-ten-season integration case now compares public/private
catalogues, player-map analysis and public fixture statistics with the forced
JSONB reader, and bounds catalogue SQL at three statements. It retains raw
source/history equality checks. A new case covers an incomplete document in one
season alongside a valid season, publication withdrawal, private reads and a
source correction without increasing the revision. Each new read sees the
current state; no process-wide cache or new publication lifetime is introduced.
Existing S2 correction, scoped analysis, provider fields, absent/null/empty values,
read-only permission and historical migration tests remain in regression.

The profile still preloads all season panels for immediate client-side switching;
filtering out other seasons would change that behavior and is not this fix.
Read API resources and response fields are unchanged. This phase needs no new
migration, normalization pass or score-cache backfill.

## Synthetic measurement and verification

The existing complete-archive fixture creates S1–S10 with all supported archive
and MP fields in an isolated PostgreSQL 17 `oclr_archive_test` database. A
regression assertion reproduced 241 queries before the fix and 3 after it.
Observed local catalogue duration was about 104 ms before and 24–26 ms after;
these are individual warm samples, not production guarantees or timing gates.
The complete DTO is checked exactly; latency is not used as a flaky test limit.

```sh
# Use a migrated, dedicated TEST_DATABASE_URL with a separate test segment.
npx vitest run tests/integration/archive-relations.test.ts --disableConsoleIntercept
```

Final combined verification and commit-specific CI are recorded on the PR.
The public browser navigation was checked manually; E2E: not run (too slow), per
the current development policy. Production deployment and post-deployment latency
acceptance remain separate operator work.
