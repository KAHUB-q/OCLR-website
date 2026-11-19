# Daily S11 SIP ratings

The S11 player directory and saved read API use the total `rating.value` from
Skill Issue's `GET /ratings/{osuId}`. The worker checks the returned
`playerId`, then stores the total, projected overall/mod/skillset Rating fields
and the OCLR fetch time by osu! ID in PostgreSQL. It looks up accepted
registrations in the published S11 edition. Page loads, filters and remote
frontend reads make no requests to Skill Issue. The directory still uses the
cached total only. For profiles, a current public participant can have API
details independently of an osu! snapshot. If the API total is unavailable,
a still-public accepted S11 player can use their saved S11 CSV total. An old
CSV row without an import time does not acquire a synthetic timestamp.

The daily job sends requests serially, with at least one second of delay before
each request. A PostgreSQL session lock prevents simultaneous jobs on the same
database. Successful and missing ratings are checked at most once per UTC day;
a manual rerun can finish players skipped after a failure. Timeouts, invalid
payloads and other temporary errors preserve the last good rating. A 404
counts as missing for this run and prevents a repeat lookup today, without
changing any verified value, details or fetch time. The worker saves Mod and
skillset ratings even when the overall rating is absent. A total or any such
entry counts as updated. A successful response with no ratings counts as
missing. A 401, 403 or 429 stops the run without retries. Run a single worker
schedule for this token because independent databases do not share the lock.

## Operator setup

The existing `oclr.service` runs SIP at the
[daily rating refresh](deployment.md#daily-rating-refresh). Set
`SIP_API_TOKEN` in the protected `/etc/oclr/runtime.env`. The provider
receives it in the `source` header on the fixed `https://skillissue.app`
origin, and the client rejects redirects.

The runtime database role needs read access to published S11 registrations
and edition settings, plus SELECT, INSERT and UPDATE on `sip_rating_cache`.
Check the public S11 list after the first successful run. The job reports
only counts for pending, updated, missing and failed lookups and whether it
stopped early.

For local verification with an isolated database, export its `DATABASE_URL`
and use `npm run db:refresh-sip-ratings -- --dry-run`. This counts pending
players without contacting Skill Issue or writing. `--apply` additionally
requires the provider token and should be used only on the intended database.
