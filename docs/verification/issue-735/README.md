# #735 — Candidate skillset tags

2026-11-03 (Asia/Taipei), based on main `39c25d65`.

Each private candidate now shows its skillset summary between the map and comments.
The editor is a native modal with 29 multi-select choices in six literal skill
groups, clear/cancel/apply, Escape/backdrop dismissal and focus restoration. Its
header/footer remain outside the scrolling choice area. The candidate layout uses
the reviewed vertical map → tags → comments order at desktop and mobile widths.

Writes use the existing edition-scoped selection capability, transactional edition
lock, grant recheck and archive guard. An independent skillset version prevents
stale overwrites; successful changes record before/after tags and versions in the
mappool event log. An unchanged set produces no write/event. Validation rejects
unknown or duplicate values. Tags remain candidate data when promoting maps.

Migration `0073_candidate_skillsets` and its generated snapshot/journal add empty
tags and version 1 to existing candidates. No database was migrated locally or in
production. The reviewed migration must precede the updated backend at deployment.
Saved-read contract 1.18.0 includes the fields; Developer/remote writes remain denied.
Interface catalogs include the reviewed modal labels and new conflict/refresh-error
messages in all three locales; final wording/visual acceptance belongs to review.

## Verification

- `npm run check`: passed (lint/types).
- `npm test`: final run 1,621 passed, 711 skipped, 0 failures; 196 passing files,
  72 skipped. The initial run exposed untranslated heading registration and a
  worker startup timeout. Those were corrected/rechecked before the passing full run.
- New policy tests: 10 passed, using actual service/auth functions with an in-memory
  database adapter. Cover choices, authorized roles, clearing, no-op, stale writes,
  invalid commands, read-only/scope denial, revocation and archive protection.
- `npm run build`: passed after final UI/message changes.
- `npm run i18n:extract` and final `test:i18n`: passed (4 tests).
- `npm run read-api:generate` and final `read-api:check`: passed; 57 contracts,
  182 coverage rows, 8 tests.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

No isolated `TEST_DATABASE_URL` was configured. The SQL integration case for
concurrent writes, persistence and cross-edition access was added but skipped;
the adapter tests do not establish PostgreSQL lock/migration behavior. Component
fixtures/assertions were updated for the modal and vertical layout. E2E/component
browser suites were not run (organizer instruction; too slow). No live write,
deployment or browser visual acceptance is claimed. Commit-specific CI is recorded
on the issue/PR.
