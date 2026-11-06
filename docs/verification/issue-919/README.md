# Historical archive read cutover (#919)

Local verification on 2026-11-06, Node.js 24 and PostgreSQL 17, using a separate
loopback-only `oclr_archive_cutover_test` database with synthetic records. The
organizer separately reported the preceding background-worker deployment working
in production; this record does not establish production migration 0082/cutover.

## Compatibility and migration

- All ten synthetic historical seasons retain exact public/private tournament
  DTOs, source ordering, optional fields, unknown identities and real zeroes.
  Public source-only appendix filtering remains unchanged.
- Statistics, personal map analysis and background MRA remain equivalent. Ready
  tournament/catalogue reads return zero source archive JSONB values; ready
  statistics continue avoiding raw MP JSONB.
- Missing/old source metadata, changed archives without revision increments and
  incomplete typed documents use preserved source data. One failing season does
  not invalidate the others; publication is checked on each new read and on a
  full-row fallback.
- Concurrent updates preserve edition metadata/archive consistency in a read-only
  repeatable snapshot. Failed writes roll back source JSONB, source digests,
  immutable history, typed documents and current pointers together.
- A populated pre-0082 migration preserves existing documents, heads and source
  JSONB/history, initializing source sidecars while leaving old head digests null.
  The normal apply binds existing documents without rebuilding them. Missing
  sidecars can be repaired explicitly; page reads never repair/write metadata.
- Active-season registration/settings JSONB remain unchanged. Forced
  `OCLR_ARCHIVE_READ_MODEL=jsonb` still produces equivalent results.

## Ten-season synthetic measurement

Ten complete synthetic archives, each with 40 fixtures, retained source-only
appendices, qualifiers, replacements and difficulty metadata. No production data,
credentials or provider requests were used. Both implementations read the same
prepared database and immutable documents, in serial runs after one warmup.

The baseline is the actual preceding implementation at
`f10bda2e6478a32c75312d3d5495a51d34af3831` (the same tree as merged `7e765bdd`).
Results include every SELECT, including the typed `UNION ALL` transport query;
transaction-control statements are excluded. Bytes are serialized driver result
rows, not PostgreSQL wire bytes, page payload size or browser latency.

| Measurement                          |    Before |     After |
| ------------------------------------ | --------: | --------: |
| SELECT queries                       |         3 |         2 |
| Driver result bytes                  | 1,736,708 | 1,247,085 |
| Source archive JSONB values returned |        10 |         0 |
| Median elapsed ms (five samples)     |    109.87 |     88.76 |

Before samples: 109.87, 112.85, 109.08, 109.71, 110.22 ms.
After samples: 90.64, 89.86, 87.68, 87.75, 88.76 ms.
Every response had the same canonical hash
`2895239b3784c4984f210e01ebad4ce901cb898dd19419a8abc0918e76ca6717`.
These synthetic results do not establish a production speedup ratio.

The existing query observer now captures Pool.query results as well as checked-out
client promises: Pool.query internally uses a client callback, which the previous
observer did not include in byte totals. Source-archive absence is checked from
actual returned configuration values, not inferred from SQL text.

## Real CLI rehearsal

After preparing existing documents, head digests were set to null in the synthetic
database to represent an upgrade. No source configurations were changed.

1. `db:normalize-archives -- --dry-run`: 10 current documents, zero stale/created,
   total `archiveReadReady: 0`.
2. `db:normalize-archives -- --apply --verify`: 10 current documents, zero
   stale/created, total `archiveReadReady: 10`; all typed rows verified.
3. `db:normalize-archives -- --dry-run --verify`: unchanged ready/verified result.

## Checks

- `npm ci`, `npm run check`, production build and `npm audit --omit=dev` passed;
  production dependency audit found zero vulnerabilities. The initial sandboxed
  Turbopack compile stalled and was interrupted; the unrestricted retry compiled
  successfully and completed the build.
- Full local suite: 289 files, 2,549 passed and two existing skips (2,551 total),
  381.91 seconds. The final affected four files/18 tests passed after additional
  rollback/integrity assertions.
- Read API generation/check passed (59 resources, 185 coverage rows, eight tests).
  All three generated contract/coverage artifacts are byte-for-byte unchanged.
- Formatting, new documentation links and `git diff --check` passed.
- E2E: not run (too slow), following the ordinary development policy.

Commit-specific CI is recorded in the PR. See the
[operator rollout](../../archive-relational-queries.md#direct-archive-reads-after-migration-919)
for migration 0082, ordinary normalization/verification, readiness criteria and
the retained JSONB read rollback. No production services were changed here.
