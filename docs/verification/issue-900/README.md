# Historical archive refactor verification — 2026-11-05

Scope: #899 and #900, based on main
`0def08787e9005d187c84d18ff54336dd03e267e`. Implementation is on
`codex/archive-relational-queries`; no main merge, production deployment or
production data operation was performed.

## Delivered stages

- #899: remove S2 GS DT5/TB1 at the saved-data write boundary and through a
  default-preview, revision-checked operator correction. Remove the display
  filter. Prove retained selected scores, complete-fixture review and recorded
  pick/ban coverage before rebinding current statistics; preserve sources,
  publication timestamps, old edition versions and automatic audit.
- #900: additive migration 0077, immutable before/after MP JSONB history,
  typed derived relations, pure reversible projector, atomic/idempotent backfill
  and explicit forced rebuild retaining previous generations.
- #900: compatible tournament/private-workspace/public-score readers, source
  version checks, publication/withdrawal checks and JSONB fallback. Existing
  public sanitizers, analysis functions and remote read contracts remain in use.

## Actual local results

Node 24.22.2, locked `npm ci`, dedicated newly initialized PostgreSQL 17 on
loopback port 55479; only synthetic data in `oclr_archive_test` and disposable
`oclr_archive_migration_*_test` databases. No original checkout configuration or
preview process was used.

| Check                                                          | Actual result                                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                | Passed, including lint and generated route/TypeScript checks                                                    |
| `npm run build`                                                | Passed                                                                                                          |
| `npm audit --omit=dev`                                         | 0 vulnerabilities                                                                                               |
| Initial combined unit/integration batch                        | 281 files passed; 2,482 tests passed, 2 existing skipped                                                        |
| Combined batch after adding immutable-history upgrade coverage | 2,485 passed, 2 skipped, 1 new upgrade test hit the 15-second limit; 281 files passed, 1 failed, 316.12 seconds |
| Affected rerun after reducing migration fixture I/O            | All 5 files / 31 tests passed, 6.22 seconds                                                                     |
| Read API generation/check                                      | 57 contracts, 184 coverage rows, 8 tests passed; no generated contract changes                                  |
| Formatting, changed documentation links, `git diff --check`    | Passed                                                                                                          |
| E2E/Playwright                                                 | Not run (too slow), following current main AGENTS.md ordinary-development policy                                |

The new upgrade test originally copied the entire Drizzle directory, including
unused schema snapshots. Its fixture now copies only the journal and SQL needed
for the actual upgrade. The affected rerun includes that upgrade, JSONB-history
immutability and rollback, concurrent S2 corrections, pick/ban contradictions,
transactional generation failure and repair, stale-source fallback, withdrawal,
private appendices, source-score preservation, archive package roundtrips and
pre/post-backfill read/analysis equality. No application rule was weakened to
make a fixture pass. The failed combined run is not represented as a full pass;
the complete suite was not repeated after the test-fixture-only adjustment.

## Remaining operational evidence

Actual production S2 JSONB correction and relational backfill remain to be run on
the intended operator host at its current revision using the
[operator guide](../../archive-relational-queries.md). Formal performance gains,
production coverage and release acceptance are not established by local tests.
CI status must be checked for the pushed commit and is recorded on the issues.
Issues remain open for review; no new Chinese interface wording was introduced.
