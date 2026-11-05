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
invalid release aborts the whole transaction. Stale snapshots stay stale. Raw MP
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
