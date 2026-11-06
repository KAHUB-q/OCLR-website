# Historical player-map SQL aggregation (#911)

This phase starts at main `a700f9a73255e487cf82a9fcd978d0f7618da2c6` and
optimizes the historical player-map analysis shared by profiles and saved reads.
Other archive queries keep their existing implementations and contracts.

## Behavior and preservation

The existing validated public generation, archive/configuration identity,
transaction-maintained source digests, score policy and EZ multiplier still gate
the optimization. Guard and aggregate use a read-only repeatable snapshot.
Unavailable/stale caches use the existing source pipeline; private or withdrawn
results do not become public. Live approved results and remote resources retain
their existing paths.

SQL ranks every counted participant in the player's games, derives their means,
team sizes and results, and counts distinct maps for roster/observed teams,
including bench appearances. Only personal ranked rows leave the database.
The shared TypeScript finalizer retains date ordering, categories, mod ordering
and summary arithmetic. SQL sums cast scores to double precision and accumulate
in original source order, matching JavaScript rather than changing rounding.

Integration cases compare the exact DTO against the original pure model and
the forced-JSONB reader. They cover competition ties, duplicate UIDs, explicit
winner precedence, raw-score winners despite adjusted personal scores, three
teams tied at the top, 3v3/4v4 inference, scores below/at 2000, zero means, large
integer sums, missing accuracy, source ordering, roster/observed teams, bench
maps, empty personal records and shared read-only snapshots across seasons.
Missing generations, withdrawal and unpublished editions exercise fallback.
Existing source-digest/policy/EZ and S2 correction suites remain in full regression.

Migration 0080 adds a typed title and two partial covering indexes. A populated
0079 upgrade/repeated-migration test compares the original MP JSONB, immutable
revision history, existing generations and retained play payloads exactly, then
checks that the new title preserves the source text. Complete archive relations
and original JSONB remain available.

## Synthetic query measurement

Measured locally on 2026-11-06 with Node.js 24 and PostgreSQL 17, using only the
isolated `oclr_archive_test` database. The benchmark integration fixture creates
40,000 scores over 5,000 games: the player appears in 10 maps, their team in 500.
`VACUUM (ANALYZE)` establishes the visibility map/statistics appropriate to stable
historical generations. No planner flags or `enable_seqscan` overrides are used.

The prior query is the existing scoped `publicArchivePlayerPlays` selection;
the new query is `archiveMapPerformanceQuery`. Seven warm
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` executions per query provide the median
SQL time. Service measurements include guard/transaction and the original
JavaScript aggregation, alternating seven samples after one warm-up per path.
Serialized database-result bytes below describe only the score/aggregate query;
the integration test also asserts the reduction across all service queries.

| Measurement               | Previous scoped read |             SQL aggregate |
| ------------------------- | -------------------: | ------------------------: |
| Returned SQL rows         |                4,000 | 1 (10 maps + denominator) |
| Serialized result bytes   |              935,471 |                     2,379 |
| Median SQL execution      |            10.866 ms |                  0.512 ms |
| Shared buffer hits        |                5,387 |                        66 |
| Shared disk reads         |                    0 |                         0 |
| Median service + analysis |            20.505 ms |                  3.630 ms |

The aggregate uses `archive_read_play_counted_uid_idx` for 10 personal game IDs,
the existing `archive_read_play_game_idx` for 8 participants × 10 games, and
`archive_read_play_counted_team_idx` for 2,000 team scores reduced to 500 maps.
It does not scan unrelated teams' scores for the denominator or transfer their
payloads. See the captured [benchmark summary](benchmark.json).

Reproduce the synthetic dataset, exact result checks and actual index choices:

```sh
# Export a dedicated, migrated TEST_DATABASE_URL containing a separate test segment.
npx vitest run tests/integration/archive-map-performance.test.ts
```

These are warm synthetic measurements, not production latency or deployment
acceptance. Production data distribution, cache coverage and database statistics
will affect actual plans. Existing matching score generations activate after the
migration; normalized documents alone need the optional reviewed score backfill
described in the [rollout guide](../../archive-relational-queries.md).

## Verification

Final combined verification and commit-specific CI are recorded on the PR.
E2E: not run (too slow), per the current development policy. No browser behavior
changes or live database operations are included.
