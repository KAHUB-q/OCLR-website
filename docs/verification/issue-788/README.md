# Exhibition rounds and historical mappool selection (#788)

Verified locally on 2026-11-04 (Asia/Taipei), with Node 24.22.2, npm and a
separate PostgreSQL 17 cluster/database `oclr_788_test`. Feature branch:
`codex/788-exhibition-rounds`, based on main
`e9b2e45a9e2ca86149739caa502ffdbfe57f0134`. The original organizer checkout and
its uncommitted changes were preserved. Subsequent main observed during the
work: `e17290eb`; this report does not claim that later main changes were merged
into the feature branch.

## Behavior checked

- Round/mappool management have an Exhibition stage. Stage is stored, independent
  of authored round names, and cannot be changed by round editing. Existing
  protected fixture history and knockout-only progression rules remain enforced.
- Select public archive maps or released saved maps from other completed public
  editions, individually or all visible maps, up to 50 per save. Search by map
  title, slot or BID. FM policy must be configured explicitly.
- Save verifies current official metadata and appends within each original
  category; original edition/pool/slot/BID provenance is retained. It does not
  change the source pool or copy replay attachments. Map replacement clears
  unrelated provenance; reorder/refresh retain it.
- Source publication/content is revalidated under the transaction's source
  edition lock after provider work. Stale target/source, private source, wrong
  role/edition, duplicate map, locked target and provider failure tests preserve
  atomicity and the existing audit/version behavior.
- Exhibition fixtures still use the established reporting, approval and public
  release pipeline, and public presentation/news identify their stage. Results
  are excluded from official career records/placements, ratings, map performance,
  award inputs/completeness and official progression. A synthetic exhibition
  named `Grand Finals` does not add a career match or championship.
- Saved-read contract 1.19.0 includes `exhibition` and optional nullable source
  provenance. The protected selector composes existing public saved reads; the
  remote frontend retains its existing read-only boundaries.

## Verification results

- `npm ci` completed with the existing lockfile.
- Applied all migrations to the isolated test database, including
  `0074_exhibition_rounds.sql`. Populated historical upgrade checks explicitly
  confirm that old map entries receive null provenance without changing their
  existing data.
- `npm run check` passed on the final code/test sources.
- Full `npm test`: 272 files, 2351 passed, 8 failed, 2 skipped initially. The
  failures were the batch-preview query's missing stage join and the upgrade
  test's comparison of the new nullable column. The query was corrected and
  the upgrade test now checks null source separately while comparing all original
  fields. Re-running both affected files passed **51/51**. A subsequent final
  related run (exhibition pools, results, mappools, news, i18n) passed **50/50**.
  All eight observed failures are resolved; this is combined run evidence rather
  than a claim that the initial full invocation passed.
- `npm run build` passed, including Next's TypeScript and route generation.
  The first sandboxed attempt was stopped after it made no compilation progress;
  the build with the required local process permissions completed successfully.
- `npm run i18n:extract` and `npm run test:i18n` passed, **4/4** tests.
- `npm run read-api:generate` / `npm run read-api:check` passed: **57** contracts,
  **184** coverage rows, **8/8** contract/DX tests. An intermediate drift check
  ran while the optional source DTO was being regenerated; the final check passed.
- Scoped `npm run test:e2e` covered **22 desktop/mobile cases in 6 files**:
  exhibitions, rounds, mappools, fixtures, results and read APIs. Initial run was
  18 passed / 4 failed due to test locators (new-pool label and the older round
  test's unscoped numeric input). After fixing the locators, rounds passed
  **6/6** and exhibitions passed **2/2**. All 22 scoped cases have passing evidence.
  The final exhibition cases perform real HTTP mutations against synthetic data,
  select historical maps, check persisted provenance and public display, and
  cover en/zh-Hans/zh-Hant × light/dark at desktop and 320px mobile. They assert
  no horizontal page overflow and run English Axe checks. Existing rounds also
  cover default/cute-pastel, both themes and all three locales.
- Production dependency audit: **0 vulnerabilities**.
- Prettier and `git diff --check` passed for the changed source and documentation.

## Visual evidence and limits

[Desktop, Traditional Chinese/light](desktop-light.png) and
[320px mobile, Traditional Chinese/dark](mobile-dark.png) were visually inspected.
The remaining language/theme combinations were exercised by the browser tests.
Map covers use the normal unavailable-cover fallback in these synthetic fixtures.

This is scoped local verification with synthetic identities/provider responses,
not a full-site/all-appearance browser matrix, live OAuth/IRC rehearsal, production
migration or deployment. New Chinese wording and organizer acceptance remain
under review. Commit-specific CI status and the review handoff are recorded in
[Issue #788](https://github.com/OCLR-dev/OCLR-website/issues/788); this issue remains
open for maintainer acceptance.
