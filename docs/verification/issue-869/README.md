# #869 — test content reduction

Baseline: `ed6a313fd5e3f834dc3cc4f92c018683e9a312d6` (2026-11-05).
This change edits test content, fixtures and test policy. Application behavior,
the checks/core/full event schedule and the core business allowlist are retained.

## Inventory

The native Playwright loader enumerated both the pristine baseline tests and the
patch with the same explicit, discovery-only test database URL. `--list` does not
start a database, app server or browser. Counts include configured projects.

| Suite                                                | Before | After |
| ---------------------------------------------------- | -----: | ----: |
| Default E2E discovery                                |  1,145 |   459 |
| Functional full, excluding the separate header suite |    800 |   456 |
| Core business E2E                                    |     38 |    38 |
| Header integration                                   |    345 |     3 |
| DB-free component tests                              |    730 |   550 |
| Remote core                                          |     10 |    10 |

33 E2E spec files are removed. The retired Cartesian header fixture and its five
unit cases are also removed. No integration spec is deleted. The machine-readable
[inventory](inventory.json) contains per-file counts and source sizes;
[removals](removals.json) names every deleted file and its remaining coverage.

## What replaces the repetition

| Removed or merged work                                                                           | Remaining owner                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ten per-season appearance tours, the visitor-palette tours and cross-dashboard color/copy sweeps | One real settings/inheritance workflow; season/public preference policy; unit appearance/artwork/asset rules; representative document-palette components          |
| Header branding and overlay Cartesian products, repeated account/sidebar tours                   | One real-session player/staff routing check on the configured engines; DB-free header, header-scroll, staff-navigation and player-sidebar interaction regressions |
| Historical screenshot/copy batches #241–#244, S7 artwork and thumbnail styling                   | Historical import/publication workflows and archive/rulebook/metadata unit tests; pure cosmetic implementation snapshots are intentionally retired                |
| Broad admin/public design-review and polish tours                                                | Existing mappool, fixture, role, publication and public-content workflows; focused settings, mappool controls, navigation and staff-form components               |
| Wiki and schedule copy repeated over palettes/brightness/languages                               | Central catalog/ICU tests, Wiki article/asset unit tests, a single real Wiki page wiring check and existing schedule workflows                                    |
| The superseded early S11 hero contract                                                           | Current homepage artwork/entry checks and core anonymous/publication boundaries                                                                                   |

The removed visual suites are not copied wholesale into component tests. The
remaining component tests sample independent layout/material risks and retain
focus, keyboard, lost-response and stale-response scenarios. In particular, the
stylesheet loading/retry and cross-edition race regressions remain intact.

Shared responsive evidence previously resized and captured six full pages after
each seeded workflow. `expectWorkflowFits` now checks the workflow's own viewport;
the configured desktop/mobile projects still exercise both interaction contexts.
Successful E2E screenshots are removed; failure screenshots/traces remain.

The remote journey no longer renews credentials and repeats player navigation
for every appearance. It checks one inherited season, while retaining the shipped
asset GET/HEAD transport checks and all connection, read-only, isolation and
revocation checks. The full saved-read page/API matrix remains available.

The header suite now needs one isolated runner rather than four. Functional jobs
preflight Chromium and the header job also preflights Firefox, matching their
remaining configured projects. No event frequency or aggregate success rules are
relaxed.

## Local timing observation

The same two specs, `header.spec.ts` and `document-theme.spec.ts`, were run with
Node 24.22.2, installed Google Chrome and one worker on the same machine:

| Observation | Executions | Wall time | Failed/skipped/flaky |
| ----------- | ---------: | --------: | -------------------: |
| Before      |         86 |   178.3 s |            0 / 0 / 0 |
| After       |         18 |    18.1 s |            0 / 0 / 0 |

This is a single local component-suite observation, not a full E2E or CI timing
claim. Part of the initial observation overlapped the initial unit/integration
check, so the exact wall-time ratio is not an isolated performance benchmark.
The removal of repeated cases/navigation is measured independently by discovery.
Raw aggregate timings and environment details are included in `inventory.json`.

## Verification

Local validation used Node 24.22.2 and a newly created, isolated PostgreSQL test
cluster. No application source or dependency versions changed.

- `npm ci`, `npm run check`, `npm run build` and `npm audit --omit=dev` passed;
  the audit reported zero production vulnerabilities.
- `npm test`: 2,423 passed, zero failed, two existing pending cases. All 75
  integration specs remain. `npm run read-api:check` also passed (57 contracts,
  184 coverage rows and eight contract tests).
- The affected component selection initially passed 173/176 executions. The
  referee workflow still expected a team Pick button for a neutral TB step;
  it now uses the TB region's Pick action and retains the final BP assertions.
  The compact policy disclosure now opens with the keyboard and checks the
  actual timer field, replacing repeated locale-only readability cases. Both
  affected files then passed all 78 executions. An intermediate attempt had
  artifact cleanup errors because two local Playwright commands shared an
  output directory; separate output directories resolved this.
- A real desktop/mobile selection covering every core spec plus the affected
  settings, inheritance, Wiki and header journeys initially passed 61/64.
  A stale generic status locator collided with a loading overlay; the assertion
  now waits specifically for the conflict notice. The inheritance test also
  tried an obsolete Menu label before a direct navigation; that unused click
  was removed. The two files and the reduced footer workflow then passed all
  12 executions. The core selection's 38 executions passed in the first run.
- The two-spec presentation observation above passed before and after.
  Native discovery loaded every configured suite without errors. Removal
  ownership links, changed-file formatting and `git diff --check` passed.

Full functional, full remote and the entire browser matrix (including Firefox)
were not rerun for this cleanup; their acceptance must not be inferred from
these smaller runs. CI results belong to the exact published commit.

The contribution rules are synchronized in [AGENTS.md](../../../AGENTS.md),
[development](../../development.md#choosing-and-maintaining-tests-869) and
[CI scope](../../ci.md). New E2E cases need an independent core business outcome
or a necessary browser regression and an explanation of the existing gap.
