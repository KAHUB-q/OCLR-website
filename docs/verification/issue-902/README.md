# Historical query manifests and scoped player reads (#902)

This phase continues merged PR #901 from main
`80ece3d61253c470e017c98fb941d3eee3c6562a`. Its main CI
[run 42057676356](https://github.com/OCLR-dev/OCLR-website/actions/runs/42057676356)
completed successfully. That evidence applies to the merged baseline, separately
from this phase's checks.

## Behavior and acceptance evidence

- Migration 0078 preserves the source table and both JSONB snapshots, prior
  projector generations and immutable revision history. Its digest sidecar is
  backfilled without creating synthetic source revisions. The upgrade test
  migrates a populated 0077 database, repeats migration, rolls back a source edit,
  then verifies an unversioned edit and deletion retain the original history.
- Projector v2 caches only the existing public summary. Matching reads select MP
  IDs/digests and released plays, without selecting raw draft/published MP JSONB.
  The integration test compares the complete response against
  `OCLR_ARCHIVE_READ_MODEL=jsonb` and records executed SQL/result sizes. For the
  synthetic 80-game source fixture, serialized database-result bytes must be
  less than half the JSONB path. This is a fixture assertion, not a production
  latency benchmark.
- Scoped player reads preserve opponents, full-game ranking/means, four-player
  team classification, raw-score winners, roster and observed teams, and bench
  games in the participation denominator. Their analysis must equal the full
  JSONB play set while excluding an unrelated fixture.
- Fixture-detail SQL includes the requested fixture predicate. An unversioned
  published-source edit invalidates the cached generation, and the resulting
  response equals the JSONB reader. Missing metadata, old projector versions,
  changed score policy and changed EZ multiplier also fall back.
- Existing S2 correction, public/private boundaries, stale/withdrawn releases,
  multi-MP completeness, forced rebuild and archive roundtrip coverage remain in
  the combined checks. Read API artifacts are regenerated from source; existing
  resource parameters and response fields are retained.

## Verification

Local verification (2026-11-06) uses Node.js 24 and PostgreSQL 17 on a separately
initialized loopback-only `oclr_archive_test` database with synthetic records.

- `npm run check`: passed; final changed-file lint has no warnings.
- `npm test`: 283 files passed; 2,494 tests passed and 2 skipped (315.57s).
  After the last additions, the scoped query/upgrade cases separately passed all
  7 tests. The final generated migration was then applied to a fresh test database;
  an affected S2/relational/player/upgrade selection passed 36 tests (8.11s).
  Its remaining cases were excluded by the name filter, not acceptance skips.
- `npm run build`: passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run read-api:generate` and `npm run read-api:check`: passed. Comparing the
  generated schemas to the merged baseline also found only object-property and
  required-field ordering changes, with no schema changes.
- `git diff --check`: passed.

E2E: not run (too slow), as required by the current development policy. No UI or
browser behavior changes are included. Production correction, migration,
backfill, deployment and performance acceptance require separate operator work;
this phase performs none of those operations.
