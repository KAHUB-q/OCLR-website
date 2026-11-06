# Background player analytics verification (#916)

Local evidence on 2026-11-06, Node.js 24, PostgreSQL 17, isolated synthetic test
database. This is not production deployment or Linux timer activation evidence.

## Behavior and compatibility

- Persisted results exactly match the extracted, unchanged MRA v4/RWS/classification,
  ordering and participation calculation. The worker checks its typed DB roundtrip
  before committing.
- Cold and current public/API reads never invoke projection or write results.
  Personal MRA reads use the generation/player index and do not load archive rows.
- Integration coverage includes source edits without a version increment,
  withdrawals, edition hiding, failed/superseded jobs, overlapping jobs, immutable
  versions, fresh saved pp, read-channel rejection and unchanged source JSONB/history.
- The existing 57 saved-read DTO schemas remain structurally identical after
  resolving references; contract 1.24 adds two resources. Remote adapters cover
  current saved reads and older v1 compatibility.
- The real CLI successfully created a generation and skipped unchanged inputs on
  its next run. The production Next.js build read that CLI generation as `ready`
  with the same MRA value, confirming a shared source identity across runtimes.

## Synthetic timing

Ten published synthetic seasons, 5,010 raw games, 30 selected games, 120 players.
Archive relation backfill was applied before measurement. Two verified-combo asset
IDs exercise the actual MRA calculation. Other player IDs/game IDs differ per
season; the measured player belongs to S10. The isolated database contains no
real registrations, credentials or production sources.

After a warmup, serial elapsed times from the same process/database were:

| Operation                                                 | Samples (milliseconds)       |
| --------------------------------------------------------- | ---------------------------- |
| Original cross-season projection path                     | 3023.05, 3088.05, 3200.23    |
| Saved single-player MRA read, including source validation | 2.74, 3.03, 2.67, 2.25, 1.98 |

Both returned MRA `1.5033002559735422` for synthetic UID 91003. These timings compare
the MRA service path, not complete production page latency. Two complete anonymous
local HTTP profile requests returned 200 in 690.85 ms and 399.95 ms (296,463 bytes).

A separate, single anonymous production request before this change returned 200
in 8.069 seconds for `/players/3339073?edition=s10`, with TTFB 8.013 seconds.
The live health endpoint identified commit
`f2e36a5670520bf927094a7352588216b605887f`. Different data/hardware mean the local
HTTP result cannot establish a production speedup ratio.

## Checks

- `npm ci`, `npm run check`, `npm run build` passed.
- Full local suite: 289 files, 2,547 passed, two existing skips, 368.82 seconds.
- After the final source-identity/invalidation changes, 17 affected tests passed;
  the remote adapter's two tests also passed after its artwork conversion cleanup.
- `npm run read-api:generate`, `npm run read-api:check`, i18n extraction/checks passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- E2E: not run (too slow), following the ordinary development policy.

Commit-specific CI is recorded in the PR. Operator prerequisites and the explicit
first calculation/timer setup are in [the runbook](../../background-player-analytics.md).
New Chinese pending-state wording awaits organizer review.
