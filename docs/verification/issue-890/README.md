# Open exhibition sides — #890

New exhibition fixtures use editable fixture-local red/blue names (default
紅隊 / 藍隊), with no official team or roster selection. MP provider colors bind
each player's score independently on every map. Tests include an unregistered
replacement and a player who switches sides; no directory users/teams are created.

## Local evidence

Node 24.22.2, dedicated PostgreSQL 17 database `oclr_890_test`, loopback only.
Migrations 0075/0076 applied through Drizzle; upgrade tests preserve existing rows.
Only synthetic saved MP snapshots and synthetic accounts were used.

- `npm ci --no-fund --no-audit`: passed.
- `npm run check`: lint and types passed.
- `npm test`: 277 files, 2,445 passed, 2 intentionally skipped; 3 assertions
  failed on new nullable fixture columns and an absent-captain invite placeholder.
  These were corrected without weakening the official-team checks.
- Affected recheck (`edition-migration`, `referee-commands`, `open-exhibition`):
  all 86 passed, including the added no-fabricated-invite case.
- `npm run build`: passed.
- `npm run read-api:generate` / `npm run read-api:check`: 57 contracts,
  184 coverage rows, 8 contract/DX tests passed; contract 1.23.0.
- i18n extraction/catalog tests: passed as part of the complete test run.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Focused real-server Playwright: desktop/mobile both passed (2 journeys, 8.6s).
  Creates an exhibition via editable side inputs, reviews all three MP games,
  confirms source/rules, submits, explicitly approves/publishes, verifies side
  switches/public player links and rejects stale result commands. A test-only
  local config used port 31890 to leave another checkout's test server alone.
  No full browser matrix was run. Initial test setup omitted the existing source
  confirmation; the corrected journey checks it explicitly.
- `git diff --check`: passed.

Existing result/fixture tests own formal roster enforcement, assigned-referee
access, publication, transaction, conflict and legacy exhibition exclusions. New
integration tests cover local side persistence and rename identity, empty team
directory, free MP attribution, private-until-approved results, zero rating inputs,
no fake registrations, no client-controlled side IDs, formal-stage rejection and
provisional MP scoring. Unit tests cover missing colors, invalid team mode and
forbidden substitution overrides. The browser case covers the missing interaction:
exhibition name inputs through reviewed public output with unregistered players.

After incorporating main `bafad8b7` (#891), the affected result/exhibition/player
statistics checks passed (64 tests), and read contracts were regenerated and
verified. Formal review DTOs omit the new optional side field to preserve older
remote responses. No existing backend response gains a new required field.
The final fixture/exhibition recheck passed (19 tests), scoring recheck passed
(13 tests), and lint/types, build and contract checks passed again. Final desktop
and mobile journeys passed again (2 tests, 8.5s), including saved MP player names
in the private review.

## Reviewable UI

[Mobile editable side names](mobile-form.png) ·
[Desktop published exhibition](desktop-result.png)

New Chinese free-participation and exhibition review wording is included in the
three locale catalogs for organizer review. Stable side IDs persist on renames;
legacy official-team exhibitions retain their saved identity/history. The two
nullable migrations need the normal approved deployment workflow. This evidence
does not claim production migration, deployment, live MP use or a full browser
regression pass. Commit-specific CI is reported separately in the issue/PR.
