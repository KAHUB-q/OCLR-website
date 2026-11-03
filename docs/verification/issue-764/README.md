# Scoreboard MP automatic sync (#764)

The scoreboard contains one Automatic sync toggle and the MP link derived from
the fixture's saved IRC room. Enabling it binds that room on the server; it does
not start a match or publish a result. The control restores its saved state on
reload, follows a newly bound room while enabled, and preserves scores when
stopped. Room 0, revoked connections, and unavailable room information cannot
start a new automatic binding.

The server checks the current room before fetching and before applying a result.
The existing manual API remains compatible. Binding/session revisions, fixture
authorization, provider cooldown, leases, manual decisions and result publication
boundaries remain enforced. No migration was added.

| Synthetic capture | Light                           | Dark                           |
| ----------------- | ------------------------------- | ------------------------------ |
| Desktop           | [Scoreboard](desktop-light.png) | [Scoreboard](desktop-dark.png) |
| 320px mobile      | [Scoreboard](mobile-light.png)  | [Scoreboard](mobile-dark.png)  |

These are real component captures with synthetic fixtures and HTTP responses,
not production account or match data. The 40 affected browser cases cover
desktop/mobile, enabled states in three locales and both themes, reload,
start/stop, saved offline rooms, room changes, missing rooms, read-only/simulation,
lost responses, errors, stopping while the room changes, score updates and stale IRC reads. Fourteen Axe checks
include the 12 locale/theme/viewport combinations and two keyboard-scrollable
40-item review lists; no violations were found.

Database verification used a disposable PostgreSQL 17 cluster bound only to
loopback, with database `oclr_auto_sync_test`. All 270 unit/integration files
passed: 2,349 tests passed and two skipped. Focused MP/IRC/model/catalog checks
also passed (54 tests). The temporary database server was stopped afterward.

Reproduce the affected browser suite with Node 24 and the configured Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31468 npm run test:components -- tests/components/referee-panel.spec.ts --workers=2
```

This evidence does not establish full-site/theme browser coverage, live osu!
provider/IRC acceptance, current CI acceptance, or deployment.
