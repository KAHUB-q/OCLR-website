# #847 — Align S11 cards with S10

The organizer selected the S11 public card area at 680px and requested the S10
style. This corrects the compact S11-specific card overrides introduced in #794.

## Reference and change

Read-only inspection of the public S10 mappool on 2026-11-05 (Asia/Taipei):

- At 680px: a 200px cover, 20px star rail, 20px title and top-right actions.
- At 390px: one column, with a 16:9 cover above the metadata.

The fix removes S11's 9rem/5rem cover, removed rail, smaller title, constrained
mobile title and alternate action-position overrides. Public current-edition
cards and standalone pool pages now use the same shared `MapCardBand` layout as
the S10 archive. S11 retains its appearance tokens. Existing pool/Mod selection,
search, sorting, table, FM restrictions, map details and links remain available.

## Verification

Node.js 24.22.2 and `npm ci`, based on fetched main
`6db282278da06319e6f7bff33bc4c869d95b4f98`.

- `npm test`: 201 files / 1,673 tests passed; 73 files / 728 tests skipped without
  an isolated database. No database fixture ran against a real tournament.
- `npm run check`, `npm run build`, production audit and formatting are recorded
  in the issue/PR with their actual results and CI status.
- Focused browser regression: 18 passed. Existing tests cover desktop/320px,
  three languages, both themes, keyboard pool/Mod selection, search, map details,
  restored focus, table, no writes and seasonal appearances.
- A new reference comparison checks the actual public and archive components at
  1280, 680, 390 and 320px in light/dark under default and Skyline Pop. It compares
  columns, padding, minimum height, radius, rail, cover width/radius/aspect, title
  size/white-space, art opacity, copy padding, ruleset and action positioning.
  All pairs match, and every viewport has no page overflow.
- Manual browser review confirmed the reported 680px case and the 390px dark
  layout; the browser reported no errors.

Screenshots below contain synthetic metadata and a test cover fixture. No real
tournament data or production service was changed. No interface text was added.
Full application/DB E2E is not run (too slow); local component verification does
not establish deployment or full regression acceptance.

## Screenshots

- [1280px](s11-s10-card-1280.png)
- [680px — reported width](s11-s10-card-680.png)
- [390px](s11-s10-card-390.png)
- [320px](s11-s10-card-320.png)
