# Background player analytics (#916)

Cross-season MRA v4 rankings are computed by an explicit background job. Player
pages read one player's saved MRA; the ranking page reads saved results. Missing
or stale snapshots show a pending state and never trigger calculation or writes
during a page/Developer API request.

## Consistency and retained data

Migration `0081_background_player_leaderboards.sql` adds immutable typed result
versions and player rows, indexed by source identity and generation/player UID.
Archive/statistics JSONB, revisions, approvals and publication flags are retained.
The original MRA/RWS/classification/order/participation algorithms are reused.

Each read checks public configuration hashes, revisions/order, MP digest sidecars,
score/class/MRA policies, minimum score, maximum-combo asset and projector version.
No MP JSONB is transferred for this check. Unversioned edits, withdrawals, hidden
editions and policy changes invalidate results immediately. Prior result versions
remain stored but cannot be requested by generation through the public API.
Saved pp/artwork is read fresh separately, without provider requests or MRA rebuilds.

The worker skips unchanged inputs. A PostgreSQL advisory transaction lock prevents
overlapping jobs. Projection runs on a separate read-only repeatable snapshot; a
final manifest comparison rejects work superseded by concurrent changes. The
version and all player rows commit atomically after exact roundtrip verification.
Failures preserve existing evidence. A still-current result remains usable; an
invalidated result stays pending. Web reads never fill the cache. Bump
`PLAYER_LEADERBOARD_PROJECTOR` when projection semantics change.

## Preview and first calculation

Use a reviewed release after the normal backed-up migration/deployment. Runtime
database access needs SELECT/INSERT on the derived tables through the existing
approved role setup. No OAuth credential or provider refresh is needed.

```sh
sudo -u oclr -H bash <<'SH'
set -eu
cd /opt/oclr/current
set -a
. /etc/oclr/runtime.env
set +a
export NODE_ENV=production
npm run db:refresh-player-leaderboard -- --dry-run
npm run db:refresh-player-leaderboard -- --apply
SH
```

No arguments also previews without writing. Count-only statuses are `pending`,
`current`, `updated`, `busy` and `superseded`. `--apply --rebuild` forces a fresh
generation while retaining prior versions. Missing source digests fail closed;
use the reviewed archive-normalization workflow to repair metadata. Diagnostics
never print driver SQL, connection strings or raw sources.

## Rocky systemd timer

Review the [service](systemd/oclr-leaderboard.service) and
[timer](systemd/oclr-leaderboard.timer) for the intended host's Node.js 24 path,
installation directory and runtime environment. Keep installed definitions
root-owned; application updates do not replace them. Installing/enabling this
timer is an explicit operator action, not a side effect of merging or serving pages.

From a trusted reviewed installer checkout, after migration and first calculation:

```sh
sudo install -o root -g root -m 0644 docs/systemd/oclr-leaderboard.service /etc/systemd/system/oclr-leaderboard.service
sudo install -o root -g root -m 0644 docs/systemd/oclr-leaderboard.timer /etc/systemd/system/oclr-leaderboard.timer
sudo systemd-analyze verify /etc/systemd/system/oclr-leaderboard.service /etc/systemd/system/oclr-leaderboard.timer
sudo systemctl daemon-reload
sudo systemctl enable --now oclr-leaderboard.timer
sudo systemctl list-timers oclr-leaderboard.timer
sudo journalctl -u oclr-leaderboard.service -n 20 --no-pager
```

The timer checks every minute with a small randomized delay. Active work is not
restarted by another activation; see the primary [systemd timer documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).
Only changed inputs incur calculation. The job runs as `oclr` with lower CPU
priority, private temporary storage and a five-minute limit. Stopping the timer
stops future checks; readers continue requiring current results. Do not
down-migrate a serving database. macOS tests do not establish Linux/systemd or
production activation acceptance.

## Verify the ranking page after activation (#917)

Check `/api/health` for the intended release, then make a small number of anonymous
reads of `/api/v1/rankings/players` and `/ranking`. A fast `pending` response only
confirms the request is not rebuilding rankings; it does not confirm that the first
calculation or timer is working. Verify `state: "ready"`, expected counts and a
calculation timestamp after the explicit first job, then confirm repeat reads use
the same generation until sources change. If results remain pending, inspect the
existing worker's count-only diagnostics and timer journal before starting another
job. Do not add a second scheduler or a request-triggered fallback.

The [#917 verification record](verification/issue-917/README.md) compares the complete
saved leaderboard with the original request path and provides an isolated synthetic
benchmark. Production HTTP timings and local synthetic timings are recorded separately.

## Saved-read compatibility and validation

Contract **1.24.0** adds anonymous/read-only `GET /api/v1/rankings/players` and
`GET /api/v1/players/{osuId}/mra`, exposing readiness/calculation time without
starting the job. Current remote frontends use saved resources; older v1 backends
retain the prior public-score compatibility calculation until upgraded. A remote
frontend needs no local DB. The worker rejects remote mode and cannot apply from
the delegated read channel.

All seasons share these readers and the job. Costly player profiles are no longer
automatically prefetched from directory/ranking/roster links; clicking and edition
switching remain available. Existing archive queries and individual map analysis
retain their compatible read paths.

Tests compare persisted metrics with the original projection; cover missing/current
reads without computation/writes, single-player lookup, fresh saved pp, source and
publication invalidation, concurrent workers, superseded work, failure retention,
immutable rows and remote/API access. See the PR for final combined checks and
synthetic measurements. Production deployment and timer activation are separate
operator work; new Chinese pending-state wording requires organizer review.
