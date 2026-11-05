# Historical JSONB correction and relational reads (#899, #900)

JSONB remains the authoritative saved evidence. Corrected current data and old
evidence are different versions: S2 GS never had DT5 or TB1. They must be removed
from the current saved archive, not hidden by a presentation filter. S2 Final
DT5/TB1 and every other season/pool are unaffected. The captured public inventory
in `docs/imports/early-season-mappools.json` remains evidence of the old save.
New Admin archive imports correct those two slots at the write boundary.

## S2 operator correction

Use the reviewed release and an explicitly configured operator database. This is
an operator data operation, not an automatic page read or a public web endpoint.
No provider credentials, MP refresh, role grants or new result approval are used.

```sh
npm run db:correct-s2-pool -- --dry-run
npm run db:correct-s2-pool -- --apply --expected-revision=N
```

The default is a read-only preview. Substitute the actual revision from that
preview for `N`. Applying locks S2, checks the revision and requires a completed
archive without registration. It preserves the old configuration revision,
creates a new revision, removes only the two GS slots and records an automatic
`archive_pool_correction` audit event. A repeat at the current revision is a no-op.

The archive fingerprint includes pool slots, so simply deleting rows would make
released statistics stale. Before updating the fingerprint association, this
operation compares every current draft/released selected-score projection at the
edition's configured EZ multiplier and revalidates every currently released
fixture against both archives, including its complete MP set. Any change or
invalid release aborts the whole transaction. Recorded picks/bans and their
fixture coverage must also remain unchanged; a ban referencing a removed slot
requires review instead of silently becoming unknown. Stale snapshots stay stale. Raw MP
sources, game selections, exclusions, adjudications and publication timestamps
are not rewritten. Statistics versions advance only for changed associations.

Deploy/activate the renderer without the old display filter together with this
correction; until the operator applies it, old JSONB intentionally remains visible
as saved. Do not mistake merging code or a local synthetic test for correcting
the production database. Verify the raw saved GS has neither slot, Final retains
its own slots, and released plays, review choices and coverage are unchanged.

## Relational rollout

The following implementation stages retain the same public/private projections,
publication checks and saved read API contracts. Derived tables must be
reconstructible from preserved JSONB, with explicit source and projector versions;
unknown values and source ordering must survive reconstruction. No historical
person becomes an account, a registration or a staff grant.

### Implemented stages

Migration `0077_historical_relational_reads.sql` is additive. It first retains
all existing MP statistics in `historical_statistics_revisions`; a transactional
trigger then captures before/after JSONB on every subsequent insert, update or
withdrawal/deletion, even between read-model backfills. Revision rows reject
UPDATE/DELETE. A content hash deduplicates identical records without losing
same-version corrections. This does not grant any new authority to publish.

The migration It creates a version
manifest plus typed relations for teams, people/participation, draft picks,
fixtures/rounds, fixture MP links, pools/maps, standings/final placements,
draft/published MP snapshots, games, individual source scores, review decisions
and validated public score facts. UID, team, phase, slot, map, scores, accuracy,
combo, hit counts, mods, timestamps and placement fields can be queried directly.
Small JSONB payloads retain exact optional fields, provenance and source details
needed to roundtrip the existing contracts. They are not a second writable master.

Unknown identities have nullable UIDs and no account/role foreign key. Source
scores use their source position as identity, so unknown/duplicate UIDs and actual
zeroes survive even when those records are ineligible for publication. Raw game
team colors remain separate from reviewed player-team attribution. Original
scores and EZ-adjusted scores remain separate; existing integer rounding,
relative-score denominators, raw team winners and coverage rules are reused.

The pure projector roundtrips the archive and each source snapshot before a
version is saved. Object-key ordering is ignored only for JSONB content hashes;
array order and missing-versus-null fields remain significant. Existing
`statisticsArchiveKey`, source fingerprints and result approvals are preserved by
read-model backfill. Each generation identifies the edition revision, full saved
statistics manifest, projector version and score policy/EZ multiplier.

### Saved-only backfill and rollout

After applying the migration, first preview/correct S2 as above. Then:

```sh
npm run db:backfill-archive-reads -- s2 --dry-run
npm run db:backfill-archive-reads -- s2 --apply
npm run db:backfill-archive-reads -- --dry-run
npm run db:backfill-archive-reads -- --apply
```

Omitting slugs selects saved historical editions only. No provider request runs.
A preview takes a read-only consistent snapshot and reports counts/hashes without
private source content. Apply locks one edition at a time and inserts its whole
generation in one transaction. Normal reruns are idempotent, including concurrent
backfills. Use `--apply --rebuild` to create a fresh generation for unchanged
sources if repairing derived data; previous generations and original JSONB remain.
An interruption never activates a partly inserted generation.

Tournament reads reconstruct the same archive shape before the existing public
sanitizer runs. The statistics workspace can read reconstructed private snapshots;
public statistics can query indexed validated score facts by fixture, UID, team,
stage or beatmap. Existing algorithms, UI and read API schemas remain in place.
Source-only appendices and raw MP/event/review data are never public just because
a derived generation exists. Remote frontend mode still uses its backend contract
and performs no local DB access.

A generation is used only when its source identity and projector version match.
New archive/configuration revisions fall back to JSONB. New drafts, refreshed
sources, changes to the EZ policy, publication and withdrawal invalidate the score
manifest; public statistics fall back to the existing validated published-snapshot
pipeline immediately. Business writes do not synchronously duplicate an entire
season or wait for backfill. Re-run backfill when an updated stable archive should
use relational reads again. Core archive rows may still be used when only MP
statistics changed and the archive itself is unchanged.

For a read-path rollback, set `OCLR_ARCHIVE_READ_MODEL=jsonb` and restart the
application with that exported environment. This changes only the reader: it does
not restore the erroneous S2 slots, delete JSONB, drop derived tables or alter any
approval/publication state. Do not down-migrate a serving database.

### Verification and limits

Local checks use synthetic records in a separately initialized loopback-only
`oclr_archive_test` PostgreSQL instance. Tests compare pre/post-backfill tournament
and public projections, the staff workspace, player/history/competition records,
map performance and public match statistics. They exercise private appendices,
concurrent idempotency, stale-source fallback and withdrawal. Package roundtrips
cover all eight maintained S4–S10 import files, including both S6 packages.

Actual production correction/backfill, deployment and performance improvement are
not established by these tests. Current JSONB must be inspected through the
operator preview on the intended host, then applied at its actual revision. No
production credentials or database are needed for development verification.
