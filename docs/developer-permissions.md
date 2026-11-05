# Developer website permissions (#904)

The Developer grant adds staff reads without removing the account's ordinary
website participation. This audit covers normal same-origin browser sessions;
Developer Bearer credentials and remote development retain their separate
read-only transport boundary, including for users who also hold other roles.

| Surface                                                      | Normal website Developer account                                      | Enforced boundary                                                                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Public pages, player profiles, published teams/pools/results | Same public browsing as other users                                   | Existing edition/publication checks                                                                                           |
| Public player messages                                       | Post, edit and delete own messages                                    | Published accepted target, session author, versions, idempotency, rate limit                                                  |
| Registration                                                 | Submit/reapply and withdraw own application                           | Existing rules/eligibility, window, lock, appointment/team and owner checks                                                   |
| Personal practice and timetable                              | Save/delete own practice and save own availability                    | Accepted registration or captain appointment, owner, published pool, version/context, edition lock/completion                 |
| Fixture schedule requests                                    | Save own availability; participating appointed captains can negotiate | Current team/appointment, fixture state, two-captain agreement; approval still requires an independent schedule Admin         |
| Captain draft picks                                          | Existing appointed-captain actions                                    | Actual appointment, active team/turn, session/version and candidate checks; no grant from Developer alone                     |
| OCL Chess                                                    | Normal signed-in participation                                        | Pause, cooldown, input, request ID and transactional audit; moderation remains global Admin-only                              |
| Theme, appearance and locale                                 | Existing personal preferences                                         | Existing public appearance allowlist; independent of staff permissions                                                        |
| Profile identity and team avatar                             | Existing public/profile reads; no new editing powers                  | Login identity remains provider-derived; team avatar mutations remain staff-authorized                                        |
| Staff workspaces and API                                     | Read under the existing Developer grant                               | Every mutation/export retains its specific capability/assignment; other explicit roles retain their original scoped authority |
| Developer credential management                              | Create/revoke own short-lived read credentials                        | Original browser session and live explicit Developer grant; credentials never authorize business writes                       |

## Implementation and regression coverage

`assertUserWriteChannel` checks the channel without looking at staff grants.
Normal-user message, registration, practice/timetable, schedule and canvas writes
use this guard and retain their operation-specific authorization. Staff operations
continue to use `assertBusinessWrite` and/or their specific capability checks.
The practice/timetable read model derives editable state from the edition and
owner after enforcing the direct-session and player-eligibility checks.

Existing integration suites cover Developer message ownership/edit/delete and
read-channel rejection; Developer registration/withdrawal and transport rejection;
personal practice/availability with locked/completed editions; and Developer
player/captain scheduling without staff approval authority. The existing global
Developer mutation inventory exercises all Admin mutation routes, sensitive
exports and mixed-role scoping. OCL Chess, saved-read/remote, captain draft,
profile/media, and preference suites supply their existing boundary coverage.

This is an implementation audit, not a deployment or live-account test claim.
Issue #904 records the actual verification results and review state.
