# Ranking page performance verification (#917)

## Reused implementation

#916 was completed by merged PR #918, main commit
`7e765bdd4bf3b6a7101df5470662d32b0e2795e6` on 2026-11-06. It already switches
`/ranking` and the saved-read API to versioned background results. This follow-up
verifies the complete leaderboard, including saved pp/art, rather than rebuilding
the worker or changing the MRA/RWS/classification algorithms.

The [existing runbook](../../background-player-analytics.md) owns migration 0081,
the first calculation and the timer. A deployed application alone does not enable
the timer. Missing or invalidated results return `pending`; public reads never run
the calculation. Source/publication validation remains active on every read.

## Reproducible synthetic comparison

Measured on 2026-11-06 with Node.js 24.22.2 and PostgreSQL 17. An isolated database
contains ten synthetic published seasons, 5,010 raw games, 30 selected/countable
maps and 120 distinct players, with saved profile artwork/pp and archive relations.
No production data, account credentials or provider requests are involved.

The [benchmark](benchmark.ts), with its [recorded output](benchmark.json), reproduces the former full projection plus profile
decoration, then compares the complete saved result against it. This exercises
the actual shared ranking services. It does not mock the database or projector.

| Operation                                                      | Samples (milliseconds)       |
| -------------------------------------------------------------- | ---------------------------- |
| Former full leaderboard projection and saved pp/art            | 3136.30, 3156.49, 3180.12    |
| Saved full leaderboard, including source validation and pp/art | 6.87, 5.82, 6.12, 6.48, 5.66 |
| Ten concurrent saved full reads, total elapsed                 | 37.21                        |
| Missing generation, returning pending                          | 3.08                         |
| Explicit first background calculation                          | 3349.35                      |

All ranked rows, ordering, classification, counts, numeric values, pp and artwork
are deeply equal. Repeated/concurrent reads retain one generation and its same
calculation timestamp. The serialized full saved DTO is 54,327 bytes.
These service timings are not complete-page timings or a production speedup ratio.

To reproduce, first provision/migrate a disposable database with a separate `test`
name segment as described in [development](../../development.md). Export its URL
as `TEST_DATABASE_URL`, then run from the repository root with Node.js 24:

```sh
DATABASE_URL="$TEST_DATABASE_URL" node --import tsx docs/verification/issue-917/benchmark.ts --seed-synthetic
```

The explicit flag resets fixtures by truncating the guarded test database. The
script does not load environment files and rejects a missing/non-test target or a
different `DATABASE_URL`. Never use the demo or a shared/production database.

The existing three worker integration tests also passed independently. They cover
exact projection equivalence, saved page/API reads without projection or writes,
fresh pp, unversioned edits, publication withdrawal, hidden editions, concurrent
workers, superseded calculations, failure retention and immutable versions.

## Public deployment baseline

A single anonymous request before the organizer's deployment returned HTTP 200:

- `/ranking`: TTFB 7.342826 s, total 7.479755 s, 748,481 uncompressed bytes.
- The public page reported 380 players, ten editions and 2,021 counted maps.
- `/api/health` identified release `537db5e15be44b4c77312b53d9d12bb88e5abc61`,
  which precedes #916/#918.

This is one baseline sample, not a production percentile or a controlled load test.

## Production after organizer activation

After the organizer deployed #918 and reported installation, anonymous health reads
identified `7e765bdd4bf3b6a7101df5470662d32b0e2795e6`. The saved-read API returned
`ready`, calculation timestamp `2026-11-06T03:40:47.351Z` (11:40:47 Asia/Taipei),
380 players, ten editions, 2,021 counted maps and 16 skipped maps. The API request
took 0.160761 seconds (TTFB 0.109837 seconds). A later complete response was deeply
identical, including its calculation timestamp.

Serial anonymous measurements from the same client, with no concurrent load:

| Response | TTFB (seconds)               | Full response received (seconds) | Uncompressed bytes |
| -------- | ---------------------------- | -------------------------------- | ------------------ |
| HTML     | 0.386292, 0.309444, 0.318249 | 0.539036, 0.374648, 0.393076     | 749,444            |
| RSC      | 0.035794, 0.053824, 0.036817 | 0.323192, 0.343061, 0.316380     | 444,357            |

Raw status/type/timing evidence is in [production-http.json](production-http.json).
Every recorded sample returned 200; RSC samples returned `text/x-component`.
Initial RSC probes with a non-normalized query returned 307 and are excluded.
These are HTTP response timings, excluding subsequent images, browser paint and
hydration. The HTML median is 0.393076 seconds, compared with the single 7.479755
second pre-deployment sample; this is an observed improvement, not a production SLO.

The old anonymous HTML retained the full serialized card props. All **380 rows**
(identity/order, statistics, classification, pp and artwork) were exactly equal to
card props reconstructed from the new public snapshot. The preserved counts also
match. Only public data was compared locally; no player data is checked into this
verification record.

A focused real browser check of the public ranking confirmed:

- Ready counts and the initial 50 rows display.
- PP descending changes the first row to the public API's highest-pp player.
- Reaching the list end extends the displayed list from 50 to 100 rows.
- No console errors were captured during these interactions.

The organizer performed production installation/activation. This session performed
anonymous reads and browser interactions, with no production migrations, worker
execution, publication changes or service control. A ready snapshot and repeated
reads verify the current result; they do not independently prove the timer's
future schedule or recovery on that host.

## Local checks

- `npm ci` passed; subsequent checks used Node.js 24.22.2.
- `npm run check` and `npm run build` passed after correcting benchmark types.
- `npm test`: 289 files, 2,547 passed, two existing skips, 397.23 seconds, on a
  second isolated test database so the benchmark fixture was preserved.
- `npm run read-api:generate` produced no tracked artifact changes;
  `npm run read-api:check` passed (eight tests).
- `npm audit --omit=dev`: zero vulnerabilities.
- Broad E2E: not run (too slow). Only the focused browser interaction above ran.
- No interface messages or business test scope changed.

#918's head `f10bda2e6478a32c75312d3d5495a51d34af3831` has successful CI run
[42156424685](https://github.com/OCLR-dev/OCLR-website/actions/runs/42156424685).
The current issue's commit/CI and maintainer acceptance are tracked in #917.
