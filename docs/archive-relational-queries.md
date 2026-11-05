# Historical JSONB correction and relational reads (#899, #900, #902, #905)

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

The migration creates a version manifest plus typed relations for teams, people/participation, draft picks,
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

Migration `0078_historical_source_manifests.sql` adds a small digest sidecar for
each saved MP row. Its initial backfill does not update source rows or create
additional historical revisions. An AFTER INSERT/UPDATE trigger updates the
digest in the source transaction, including legacy edits that do not increase
the source version. Source deletion removes only the sidecar; immutable JSONB
history remains. The source table gains no columns and its JSONB is unchanged.

Projector v2 stores a public summary with explicitly selected fields, source
manifest hash, score-policy version and EZ multiplier. A matching public
statistics read verifies archive/configuration identity and these small digests,
then reads validated public plays without loading draft/published MP JSONB.
Missing metadata, old generations, changed policy and any source edit use the
existing snapshot validation path, reading complete relations when available or
preserved JSONB otherwise. Source and digest reads share the same database
snapshot. Backfill locks source rows while building its generation so a concurrent
legacy update cannot associate old facts with a newer digest.

Local player-map analysis selects complete games associated with the player's
roster teams or teams observed in counted appearances. All participants remain
available for ranking, field averages, team-size classification and raw-score
winners; games where the player sat out remain in the team-map denominator.
Team/game indexes support this scope. Unrelated games can be omitted without
changing the analysis. Detailed fixture
reports load MP sources only for the requested fixture. Remote clients continue
to use the same saved-read resources and response fields.

The pure projector roundtrips the archive and each source snapshot before a
version is saved. Object-key ordering is ignored only for JSONB content hashes;
array order and missing-versus-null fields remain significant. Existing
`statisticsArchiveKey`, source fingerprints and result approvals are preserved by
read-model backfill. Each generation identifies the edition revision, full saved
statistics manifest, projector version and score policy/EZ multiplier.

### Complete relations for every historical season (#905)

Migration `0079_complete_archive_relations.sql` adds 31 typed domain relations
and immutable document versions with mutable current pointers. This covers every
field of the historical archive and statistics schemas: teams/identities, picks,
standings/placements, fixtures and match-review games, maps/difficulty variants,
season dates, source facts, qualifiers and individual qualifier scores, replacement
rosters, review tables, MP participants/events/games/scores/provider fields, and
all saved review decisions. Nested scalar attributes become typed columns;
repeated objects have child tables and composite foreign keys. Scalar lists use
native PostgreSQL arrays. Arbitrary provider keys and difficulty values have typed
key/value rows. These relations introduce no JSONB columns or payload blobs.

`archive_relation_documents` identifies the edition, MP/review kind where
applicable, codec version and full content hash. Every child belongs to that
document and its parent row; current pointers also enforce the edition/document
key scope. Source positions, optional-field presence and explicit null markers
preserve unknowns, empty lists, real zeroes and source ordering. Document versions
and their rows reject UPDATE/DELETE. Moving/removing a pointer never removes old
typed evidence, source JSONB or immutable source history.

The schema and layout are generated from the existing strict Zod schemas:

```sh
npm run archive:relations:generate
npm run db:generate -- --name=reviewed_schema_change
npm run archive:relations:check
```

The generated [schema](../src/db/archive-relational-schema.ts) and
[layout](../src/lib/archive-relational-layout.json) are committed. `npm run check`
detects schema drift; the codec rejects unknown fields instead of silently
discarding evidence. Reconstruction uses parent indexes in memory, so large MP
score collections are not repeatedly scanned for each game.
Increment `ARCHIVE_RELATION_CODEC` when changing interpretation/encoding; older
documents remain saved and fall back until normalized under the new codec.

Tournament archive saves, roster corrections, S2 correction, statistics
import/review/publication/withdrawal and operator import tools synchronize typed
documents in the same source transaction. Only changed documents are encoded;
an unchanged published snapshot reuses its existing document when a draft changes.
A typed insert failure rolls back source writes, pointers, revisions and audit
writes together. This does not publish data, create accounts or change permission
checks. Raw JSONB remains saved and is still available for verification/rollback.

Readers prefer matching complete relations and retain the existing public
sanitizers and analysis algorithms. Scoped fixture reads select only that
fixture's document identities and MP data. A legacy/direct SQL source change
invalidates the digest association, so incomplete or stale typed data falls back
to the preserved JSONB. The v2 validated public-score cache remains a faster
optional layer; a stale cache can be recomputed from complete typed snapshots.
Remote resource parameters and response schemas remain unchanged.

### Saved-only backfill and rollout

After applying the migration, first preview/correct S2 as above. Then:

```sh
npm run db:normalize-archives -- --dry-run
npm run db:normalize-archives -- --apply --verify
npm run db:normalize-archives -- --verify
# Optional: refresh the validated public-score cache as well.
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

After upgrading from projector v1, run the same preview/apply commands to build
v2 generations. Existing v1 generations stay saved and fall back to JSONB until
rebuilt. Applying migration 0078 alone does not activate the faster reader.

Tournament reads reconstruct the same archive shape before the existing public
sanitizer runs. The statistics workspace can read reconstructed private snapshots;
public statistics can query indexed validated score facts by fixture, UID, team,
stage or beatmap. Existing algorithms, UI and read API schemas remain in place.
Source-only appendices and raw MP/event/review data are never public just because
a derived generation exists. Remote frontend mode still uses its backend contract
and performs no local DB access.

A cache generation is used only when its source identity and projector version
match. New drafts, refreshed sources, changes to the EZ policy, publication and
withdrawal invalidate the score cache; the existing validated published-snapshot
pipeline can read the transactionally synchronized complete relations immediately.
Business writes do not duplicate an entire season. Re-run the optional score
backfill when an updated stable archive should use the faster cache again.
Existing seasons require the complete-relations apply above after migration;
before that, or after an unsupported legacy write, JSONB remains the fallback.

The normalization command discovers every saved archive, including S1–S3, without
a season allowlist; it also supports future valid historical editions. Output
contains counts only: expected/current/stale documents, obsolete pointers, created
versions and verification row counts. `--verify` compares all saved typed values
with preserved JSONB in a read-only consistent snapshot and fails for stale or
incomplete data. A normal apply is idempotent; `--apply --rebuild` creates fresh
document versions while retaining all previous evidence. Each season commits
independently. No live-season business JSONB is converted by this historical tool.

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
The [#902 verification record](verification/issue-902/README.md) also covers
transactional digest maintenance, a 0077-to-0078 upgrade, scoped SQL and exact
analysis equivalence against the forced-JSONB reader.
The [#905 verification record](verification/issue-905/README.md) covers complete
typed documents, all-season discovery, a populated 0078 upgrade, transactional
incremental writes and source/relational equality for every saved field.

Actual production correction/backfill, deployment and performance improvement are
not established by these tests. Current JSONB must be inspected through the
operator preview on the intended host, then applied at its actual revision. No
production credentials or database are needed for development verification.
