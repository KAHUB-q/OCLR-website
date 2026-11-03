# #757 — Footer icon for clearing skillset selection

2026-11-03 (Asia/Taipei), based on main `7eaa6656`.

The clear-selection control now lives in the dialog's lower-right action group,
before Cancel and Apply. It reuses the existing eraser WorkbenchActionIcon and
44px mappool icon-button styling. Its accessible name and title use the existing
localized Clear selection message. The former text button above the choices and
its unused wrapper styling were removed. Empty/busy states stay disabled; clearing
edits the draft, Cancel discards it and Apply remains the persistence action.

Verification:

- `npm run check`, `npm run build`, `git diff --check`: passed.
- `npm test`: 1,635 passed, 711 skipped, 0 failed; 198 passing files, 72 skipped.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Direct synthetic preview of actual client components at 1440px/light and
  320px/dark confirmed the footer icon, clearing, disabled empty state, Cancel
  restoration and no dialog horizontal overflow. The icon measured 44 × 44px.
  Screenshot inspected; task-owned loopback preview listener stopped afterward.
- Existing component assertions now check the footer location, icon-only content,
  title and disabled state. E2E/component browser suites were not run, per the
  organizer's instruction; the above was direct preview, not a test-suite run.
  SQL tests remained skipped without TEST_DATABASE_URL. No schema, messages,
  live writes, migrations or deployment changed.

Commit-specific CI is recorded on the issue/PR.
