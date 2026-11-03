# #737 — Restore horizontal desktop candidate layout

2026-11-03 (Asia/Taipei), based on main `011b5818`.

The organizer clarified that desktop candidates must show beatmap card, Skillset
Tags and comments in one horizontal row. #735 mistakenly stacked desktop sections.
The candidate list is again an inline-size container. At 52rem of available list
width it uses three columns, with skillsets between the map and comments and
vertical separators; narrower lists stack in the same order. The middle heading
can wrap within its own column. The existing modal editor and save flow remain.
Geometry assertions and current workflow documentation now reflect this layout;
the #735 evidence is explicitly superseded for desktop layout acceptance.

Verification:

- `npm run check`, `npm run build`, `git diff --check`: passed.
- `npm test`: 1,621 passed, 711 skipped, 0 failed; 196 passing files, 72 skipped.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Direct DB-free synthetic preview of the actual client components, without running
  an E2E/component test suite: 1440px/light and 1024px/dark showed all three sections
  at the same y coordinate, ordered left to right. At 390px/light and 320px/dark
  they stacked. None of those viewports overflowed the document horizontally.
  Screenshots were inspected. The task-owned loopback preview listener was stopped.
- E2E/component browser suites were not run, per the organizer's instruction.
  SQL cases remained skipped without TEST_DATABASE_URL. No schema or message changes,
  live writes, migration or deployment are part of this correction.

Commit-specific CI is recorded on the issue/PR.
