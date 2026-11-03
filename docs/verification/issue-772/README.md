# #772 — Saved intended rounds below candidate parameters

2026-11-03 (Asia/Taipei), initially based on main `9590fab8`.

Candidate MapCardBand footers now display the saved intended-round names below
the BPM/length/CS/AR/OD/HP row. Chips follow the workspace's round order and keep
authored names literal; multi-selection wraps and empty sets show the existing
localized Unassigned state. The summary reads saved roundIds, so unsaved editor
drafts do not change it. After the existing editor saves and reloads the workspace,
the summary updates from the returned data. Read-only staff see the same summary
without a duplicate inline round label or an editing control.

The implementation uses the existing optional card footer and saved workspace
data; no shared-card API, read schema, messages, authorization or migration changed.
The existing three-column desktop layout and compact actions remain.

Verification on the starting base:

- `npm run check`, `npm run build`, `git diff --check`: passed.
- `npm test`: 1,635 passed, 716 skipped, 0 failed; 198 passing files, 72 skipped.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Direct synthetic preview of actual client components confirmed summaries below
  parameters at 1440px (single round), 1024px/390px (multiple rounds), 320px
  (unassigned), and 1024px (read-only). Names wrapped without document horizontal
  overflow; the read-only preview had no round editor. Screenshot inspected and
  task-owned loopback listener stopped.

Before publication, the unpublished commit was replayed without conflicts onto
main `4446f3a1` (incoming referee UI changes). `npm run check` and read-API
generation/checks passed again: 57 contracts, 182 coverage rows, 8 tests. Generated
artifacts did not change. The full unit/build runs above precede that integration
and were not repeated; no E2E/component browser suites were run, per the organizer's
instruction. SQL cases remained skipped without TEST_DATABASE_URL. No live writes,
deployment or migration was performed. Commit-specific CI is recorded on the issue/PR.
