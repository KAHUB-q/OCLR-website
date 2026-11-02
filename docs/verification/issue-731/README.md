# #731 — practice Feel and compact availability UI

Organizer follow-up to the merged #727, implemented from main `d25bc324` on
2026-11-02. This batch retires practice stars and refines both private
sheets using MainSheet surfaces, typography and existing locale catalogs.
The next organizer request adds optional Feel alongside score/comment.

## Result

Practice contains score/Feel/comment, with compact pool/Mod tabs, labelled
reload/save/delete icons and a personal editor that stays within the visible
container. Long literal comments show a three-line preview and expand through
an explicit keyboard-accessible disclosure. New edits hide obsolete Saved text.
Current read projections and commands omit rating; legacy rating input is
rejected. The nullable legacy column remains, old reads do not modify it, and
normal owner save/delete clears it while retaining the previous value in the
private transactional audit. Separate nullable Feel storage is added by
`0072_practice_feel.sql`, with a database constraint for `bad`, `normal`, `good`
or NULL. Existing records remain unset. Old stars are never converted to Feel.
An older score/comment payload preserves saved Feel and its retry hash; current
forms explicitly send NULL to clear Feel. Deletion clears it in the same audit.
Desktop controls share one row; mobile comments use the full-width second row.

The timetable initially focuses the selected day. Weekday shortcuts and the
Week control switch between that day and the full seven-day overview while
retaining all drafts. The selected day remains visible in the shortcut strip,
and Week stays pinned on narrow screens. Resize/side-panel width changes realign
the saved hour and selected day. Names, date and time headers stay readable;
continuous state bands reduce repeated marks, and UTC offsets appear once per
date except when a repeated hour needs disambiguation. Compact undo/save and the
legend stay beside the grid; optional help supports Escape.

All existing ownership, current-captain team visibility, optimistic versions,
idempotency, chart-context, UTC/DST and unfilled/explicit-state semantics remain.

## Feel follow-up verification

- `npm ci --include=dev` on Node 24, using the existing lockfile.
- Migration `0072` applied successfully to the dedicated disposable
  `oclr_osusheets_test` database on loopback port 55482.
- `npm run check` and production `npm run build` passed. Full `npm test` on that isolated database: **267 files
  passed; 2,317 tests passed, two skipped**. New cases cover permitted/invalid
  values, nullable storage, saved team reads, private audit, old-payload
  preservation, retries, explicit clearing and deletion.
- `npm run read-api:generate` produced no delegated-contract changes;
  `npm run read-api:check` passed (57 contracts, 181 inventory rows, eight tests).
- i18n extraction synchronized catalogs; i18n tests passed in the full suite.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Manual synthetic browser inspection: desktop and 320px, light/dark, native
  Feel selection and dirty/save state. Screenshots below show only synthetic
  identities and inputs. The updated component spec was not run this round;
  E2E was not run (too slow), following the ordinary-development policy.

![Practice Feel desktop dark](practice-feel-desktop-dark.png)
![Practice Feel mobile light](practice-feel-mobile-light.png)

New review text includes 手感 and 差／普通／好, plus the practice introduction and
validation message. CI, organizer wording/layout acceptance and deployment
remain separate from local checks.

## Original UI verification at `8a4b0cc2`

- Node 24.22.2 and the existing npm lockfile/dependency installation.
- `npm test` on the dedicated disposable `oclr_osusheets_test` cluster: **267
  files passed; 2,314 tests passed, two skipped**. Includes the new retirement case
  proving legacy read safety, rejected rating input, owner save and audit history.
- `npm run check` (lint/types) and `npm run build`: both passed for the final
  implementation, including the resize refinement.
- `npm run i18n:extract`: catalogs synchronized and all new translations filled;
  i18n tests passed in the full suite.
- `npm run read-api:check`: **57 contracts, 181 inventory rows and eight tests
  passed**; personal workspace fields remain outside delegated read contracts.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Focused Chrome component browsers: **36 passed** across desktop/mobile and
  light/dark for both sheets. After the final date-strip/resize refinement, all
  **26 timetable checks passed** again, including 320px, resize, hidden-help
  geometry/Escape, day/week draft retention, touch/mouse painting, backwards
  strokes, undo, midnight, repeated New York hours, read-only boundaries and retry.
  The practice checks cover absence of stars/rating payloads, row alignment,
  full comments, pinned geometry, Mod drafts and delete/retry/recreate.
- `git diff --check`: passed. Images use only synthetic identities and inputs.

The initial disclosure tests used an implicit summary role that the browser test
engine exposed as generic; explicit button roles fixed the cross-engine naming,
and the rerun passed. Full application E2E/all-appearance matrices were not run.
CI and organizer wording/layout acceptance are separate from these local checks.

New Chinese review text: 阅读完整评论／閱讀完整評論, the score/comment-only
practice introduction and validation message. Extraction also registered the
existing missing public-name lookup error, filled in both Chinese catalogs.

![Practice desktop dark](practice-desktop-dark.png)
![Practice mobile light](practice-mobile-light.png)
![Timetable desktop light](timetable-desktop-light.png)
![Timetable mobile dark](timetable-mobile-dark.png)
