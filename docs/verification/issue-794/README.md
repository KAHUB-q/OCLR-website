# #794 — Public mappool bands

The organizer selected the “historical horizontal cards” proposal and authorized
issue creation, implementation, a PR and merge. The implementation uses the
existing public read service, shared map cards, details and table view.

## Behavior

- One released pool is visible at a time. Pool tabs preserve authored names and
  distinguish duplicates by stage/round. Stage order is group, knockout,
  exhibition. The standalone pool URL remains available beside the release date.
- Search, sorting and card/table controls share a toolbar. Mod tabs support
  arrows/Home/End through the existing WorkspaceTabs component.
- Cards retain identity, difficulty, mapper, primary values, saved adjusted SR,
  clipboard and osu! links. Phone cards remain horizontal; long titles use two
  lines, with their full accessible name and full text in Details.
- Historical archive styling is isolated from the new CSS module. No API, data,
  publication, credentials or permission changes are included.

## Local verification — 2026-11-04

Node.js 24.22.2, npm and the existing lockfile (`npm ci`). The isolated worktree
started at `83e95a72a9ed0a8931f4a4830cd6683d34b02994` and fast-forwarded to
`286a630eefb2561018b1037e30ac8ba524139467` after S9 PR #795 merged. The affected
component checks were repeated against that base.

- `npm run check`: passed.
- `npm test`: 199 files / 1,647 tests passed; 73 files / 723 tests skipped because
  this worktree has no isolated test database configured. The final UI refinements
  were additionally covered by the focused component checks below.
- `npm run build`: passed.
- `npm run i18n:extract` and `npm run test:i18n`: passed (4 tests), no catalog diff.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run read-api:generate` and `npm run read-api:check`: passed after the main
  fast-forward; generated artifacts were unchanged.
- `COMPONENT_TEST_PORT=31495 npm run test:components -- public-mappools.spec.ts --workers=2`:
  16 passed across desktop and 320px phone, all three languages and both themes.
  Covers pool and keyboard selection, one visible pool, Mod filters, search,
  saved DT SR, Details/Esc/focus, pool URL, card/table view, horizontal cards,
  long-title density, no page overflow, duplicate/single pool names and no writes.
  Additional detail/archive checks cover default, Skyline Pop, Glacier Blue and
  Sakura Circuit in light/dark. An initial test assertion matched both desktop
  and phone attribute nodes; it was corrected and all affected checks passed.
- Manual browser review confirmed the final phone toolbar, two-line titles and
  desktop dark pool switching, with no browser errors.
- Formatting and `git diff --check`: passed.

Full application E2E was not run (too slow); DB-backed publication/permission
regression remains covered by actual CI and the existing nightly/full suites.
Their selectors were updated for the new pool/Mod tabs. Local results do not
establish production deployment or full regression acceptance.

## Screenshots

The screenshots use clearly synthetic map metadata and a local cover fixture.

- [Desktop, Traditional Chinese, light](desktop-zh-Hant-light.png)
- [320px phone, Traditional Chinese, dark](mobile-zh-Hant-dark.png)
