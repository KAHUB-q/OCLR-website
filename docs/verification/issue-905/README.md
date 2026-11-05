# All-season historical relations (#905)

Scope confirmed by the organizer on 2026-11-06 (Asia/Taipei): all historical
season archives and statistics, retaining original JSONB and current
query/analysis behavior. Active-season business JSONB is outside this phase.
Baseline: merged PR #903, main `4eda1bfad690f8ef5ce9e7e2a7877e5c9fd29032`.

## Implementation and data coverage

- Migration 0079 adds 31 typed relations and document/head metadata. No existing
  table, JSONB value or revision is removed. Every field of the strict archive
  and statistics schemas has a generated column or child relation. Repeated
  objects have parent foreign keys; scalar lists use native typed arrays.
  Arbitrary scalar provider fields retain their original value types.
- Immutable document versions are independently scoped to archive, MP draft or
  MP publication. Incremental synchronization reuses unchanged documents;
  source and typed writes commit together. Cross-edition/key head references are
  rejected. Old versions survive withdrawal, replacement and explicit rebuild.
- Every source-only collection is included: unresolved identities, replacement
  histories, qualifiers/scores, review tables/games, source facts, provenance,
  structured season/match metadata and difficulty variants/values. These remain
  behind the existing public sanitizer; no identity becomes an account/grant.
- All saved historical editions are discovered from the database. S1–S10
  synthetic fixtures exercise every season; eight maintained public S4–S10
  package files (two S6 versions) are additionally checked without database
  imports. No claim is made about inaccessible production rows or missing source
  evidence for early seasons.

## Verification scenarios

Unit tests roundtrip complete archives and MP snapshots with optional/null/empty
fields, real zero scores, duplicate/unknown UIDs, arbitrary provider keys and
source order. Unknown schema fields and incomplete relations fail explicitly.
The generated layout/schema are checked against Zod during `npm run check`.

Integration tests compare all-season public/private tournament reads, player map
analysis and public statistics to forced JSONB. They verify source/revision rows
are unchanged by normalization, real accounts are not created, and SQL reads
complete typed MP rows without selecting source JSONB. The SQL observer now
distinguishes a boolean publication-presence test from transferring its JSONB
value; source-digest failure still exercises the original JSONB fallback.

Other cases cover concurrent idempotency, changed-draft-only encoding, reused
publications, withdrawal, legacy edits, immutable history, cross-edition pointers,
forced rebuild and rollback of source/history/head changes on a typed insert
failure. Existing S2 correction and Admin statistics/settings workflows now also
assert their typed documents are synchronized before returning. Upgrade coverage
populates schema 0078, applies/repeats 0079, and verifies preserved JSONB,
source revisions and existing v2 cache generations before and after normalization.

## Results and operational limits

Local verification uses Node.js 24 and PostgreSQL 17 on the loopback-only,
separately initialized `oclr_archive_test` database. Combined check/build/test,
read API and audit evidence:

- `npm run check`: passed, including generated schema/layout consistency.
- Initial `npm test`: 285 files, 2,517 passed / 4 failed / 2 skipped (360.29s).
  Two Developer inventory checks rejected numeric hash suffixes in valid table
  identifiers; the safe identifier guard now accepts standard PostgreSQL names
  and continues inspecting every table. Two native loader discovery checks found
  the JSON layout import needed `with { type: "json" }`; this is fixed.
  The affected Developer/discovery/codec selection then passed all 26 tests
  (4.65s). Discovery lists tests only; no browser was launched.
  The final schema's non-null child foreign keys/unique positions and populated
  0078 upgrade also passed the affected 32-case selection (8.06s). Other migration
  cases were excluded by the name filter. Developer fixtures include populated
  private typed archive rows before checking read-only access and rejected writes.
- `npm run build`: passed. `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run read-api:generate` / `npm run read-api:check`: passed (57 resources,
  184 coverage rows, 8 tests). Generated API artifacts are unchanged from main.
- Final migration: fresh schema creation passed; the populated 0078 upgrade
  case passed in the combined run.
- Actual CLI preview/apply/verify/repeat against 10 synthetic seasons discovered
  30 documents. Apply created 30 documents, verified 720 typed rows, and left 0
  stale documents. Repeat created 0 documents. Hashes of original configuration,
  MP JSONB and immutable source revisions matched before/after. Inspection of
  `information_schema` found 0 JSONB columns in the new complete relations.

Commit-specific CI is recorded on the PR/issue after publication.

E2E: not run (too slow), following the current development policy. No browser/UI
behavior changes are included. Full browser regression, actual production
normalization and deployment have not been performed. Existing production
archives require the documented preview/apply/verify operation after migration.
Append-only typed history increases storage; unchanged document reuse limits
duplication, and explicit rebuild retains older versions.
