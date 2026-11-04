# #785 — Remaining action-row loading feedback

Follow-up to [the #777 audit](../issue-777/README.md), requested on 2026-11-04
(Asia/Taipei). The organizer authorized implementation, a PR and merge. Work
starts from main `e9b2e45a9e2ca86149739caa502ffdbfe57f0134` in the isolated
`codex/action-loading-followup` branch. Other checkouts and existing edits are
preserved.

## Result and coverage

The reported action rows explicitly use compact button feedback for the request,
any awaited post-save callback and the subsequent route refresh. Their sibling
controls and status text are no longer covered by a parent-region mask. The
shared confirmation default remains a region lock for larger forms; open
confirmation dialogs retain their existing lock, Escape protection and error
handling.

| Audit item                                 | Repair                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament settings                        | Section saves and resume-registration use button feedback.                                                                                                                                                                             |
| Round creation/editing/deletion            | The form's save row and the edit/delete action row use button feedback.                                                                                                                                                                |
| Draft configuration and operations         | Configuration/start controls and the staff action list use button feedback.                                                                                                                                                            |
| Mappool batches and pool publication       | Move, metadata refresh and confirmed removal use button feedback. Per-map icon removal also keeps its indicator inside its trigger after confirmation. Pool publication uses a busy switch with a compact indicator next to its label. |
| Captain cards                              | Per-card confirmation actions use button feedback.                                                                                                                                                                                     |
| Stage groups                               | Save-group controls use button feedback.                                                                                                                                                                                               |
| Statistics publication/withdrawal          | Both buttons remain busy through the asynchronous workspace reload and route refresh without masking the workspace or action row.                                                                                                      |
| Team editing/publication                   | TeamEditor uses a local trigger indicator after closing its editor. Identity and roster publication use button feedback.                                                                                                               |
| Referee assignment                         | Assignment save/refresh uses a local trigger indicator; save/reload/error locks inside its dialog remain.                                                                                                                              |
| Player dashboard                           | Withdrawal uses button feedback alongside the edition-navigation actions.                                                                                                                                                              |
| Scheduling, streaming and results          | Scheduling and streaming action wrappers, including commentary, and result-review operations use button feedback. The full availability form explicitly retains its region lock.                                                       |
| Additional narrow row found during recheck | Match-source completion's confirmation action uses button feedback.                                                                                                                                                                    |

`PendingButtonLabel` reuses the compact Spinner and existing 0.5rem spacing
across confirmation buttons, publication switches, TeamEditor and
RefereeAssignment. A pending publication switch exposes `aria-busy`, retains its
saved checked state and accessible name, and remains disabled until completion.
The ordinary text and icon buttons retain their existing accessible names.

The [final source inventory](source-inventory.json) covers all 45 shared
confirmation call sites and 19 direct LoadingRegion sites. Rechecking narrow
containers (`actions`, `settings-save`, `section-title`,
`captain-card-actions`, `group-save-controls`) found no remaining shared
confirmation with the region default. Wrappers and the two custom editors were
also checked separately. The remaining regions belong to open dialogs, complete
forms, list sorting or workspace navigation/reloads; their interaction boundaries
are preserved.

No request URL, payload, expected version/revision, idempotency key, authorization
or publication rule changes. No new interface messages, dependencies, migrations
or business data are introduced.

## Verification

Node.js 24.22.2, npm and the existing lockfile:

- `npm ci --no-fund --no-audit`: completed.
- `npm run check`: passed. The final added fixtures and source-completion action
  also passed targeted ESLint and a final `npm run typecheck`.
- `npm run build`: passed, including TypeScript and production route generation.
- `npm test`: **1,638 passed, 717 skipped**, 199 passing files and 72 skipped
  files. The skipped checks require additional environments, including a separate
  test database.
- Existing affected component suites: **91 passed, 1 skipped**. Staff-role,
  mappool, tournament-settings, team-editor, streaming, captain, stage-group and
  statistics tests preserve request payloads, confirmation and read-only
  behavior, publication, avatar CSP/lifecycle, and responsive translated layouts.
  The skipped case is the existing mobile native-drag test.
- New loading regression cases: **62 passed** (58 in the combined run and the four
  statistics cases in an affected rerun). These use actual TournamentEditor, RoundManager,
  MappoolEditor, MappoolBatch, TeamEditor, RefereeAssignment and StatisticsManager,
  together with the shared text/icon/switch confirmation paths. Coverage includes
  slow HTTP, separately held route commits, awaited post-save reloads, unchanged
  payload versions, duplicate-click prevention, error/retry, read-only guards,
  retained dialog/full-form locks, sibling interaction and compact geometry in
  desktop/320px mobile and light/dark.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- `npm run read-api:check`: passed, including 57 read contracts, 182 coverage
  rows and eight contract tests.
- Prettier, local documentation links and `git diff --check`: passed.

## Visual evidence

All images are actual component-host captures with synthetic data and intercepted
HTTP. They do not depict production accounts or an authenticated live workflow.

- [Settings, desktop light](settings-desktop-light.png)
- [Settings, 320px mobile dark](settings-mobile-dark.png)
- [Publication switch, mobile light](switch-mobile-light.png)
- [Referee assignment, desktop dark](referee-desktop-dark.png)
- [Team editor, mobile dark](team-mobile-dark.png)

Reviewed the mobile settings and desktop referee captures: the pending indicator
stays inside its trigger and the sibling surface is clear. Browser assertions
also check no document overflow and a spinner size of at most 24px.

No environment file was copied into the worktree. Full database-backed E2E was
not run because no isolated `TEST_DATABASE_URL` was configured. These component
checks and local results do not establish deployment, OAuth, backend authorization
acceptance or full browser regression. CI status is recorded on the issue/PR for
the exact pushed and merged commits.
