# #759 — Compact candidate map actions

2026-11-03 (Asia/Taipei), based on main `27b11d4d`.

Workbench MapCardBand variants omit the redundant osu! web action. The title's
osu! link remains, as do history, intended rounds, official-pool promotion and
osu!direct for authorized staff. Public/historical band variants retain their web
action. Candidate toolbar triggers use 32px controls and 16px artwork; coarse
pointers retain 44px touch targets. Selectors cover the direct history/download
controls and the immediate round/promotion triggers, keeping popover/dialog
controls outside the compact sizing rule. Existing scrolling and hover/focus space
are retained. Component geometry assertions and workflow docs reflect these sizes.

Verification:

- `npm run check`, `npm run build`, `git diff --check`: passed.
- `npm test`: 1,635 passed, 711 skipped, 0 failed; 198 passing files, 72 skipped.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Direct synthetic preview of actual client components confirmed exactly four
  visible actions and no toolbar web link. All four measured 32×32px with 16px icons
  on desktop (1440px), and 44×44px with 16px icons on a coarse-pointer mobile
  viewport (390px). The title link was retained and the history dialog opened and
  closed. Screenshot inspected; task-owned loopback listener stopped afterward.
- E2E/component browser suites were not run, per the organizer's instruction;
  direct preview above is not a suite result. SQL cases remained skipped without
  TEST_DATABASE_URL. No messages, schema, migration, live writes or deployment changed.

Commit-specific CI is recorded on the issue/PR.
