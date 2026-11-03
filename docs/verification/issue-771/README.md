# BP process team colors (#771)

Recorded BP process entries use the same red/blue color rules as the series
score: the fixture's second team is red and its first team is blue. The color
follows each saved selection's team ID. Neutral TB and unknown teams inherit
the normal text color. Team names, actions, map codes, order and the empty dash
are preserved.

The summary's horizontal scroll regions are keyboard focusable and named with
their existing labels. This also keeps long BP processes readable on mobile.

| Synthetic scoreboard | Light                           | Dark                           |
| -------------------- | ------------------------------- | ------------------------------ |
| Desktop              | [Scoreboard](desktop-light.png) | [Scoreboard](desktop-dark.png) |
| 320px mobile         | [Scoreboard](mobile-light.png)  | [Scoreboard](mobile-dark.png)  |

All 64 affected component cases passed. The existing localized recording cases
now cover both teams' Ban/Pick entries and neutral TB in three locales, both
themes and desktop/mobile layouts. They check the empty state, chronological
text, actual colors, mobile keyboard scrolling and page overflow. All 12
scoreboard Axe checks passed. The captures use synthetic fixtures and HTTP
responses, with no live IRC command or production write.

Node 24 check/build, i18n extraction, read-API checks, formatting and evidence
links passed. The full unit/integration command passed 1,635 tests and skipped
716, including integration cases without an isolated test database.
Production dependency audit found no vulnerabilities.

Reproduce the component checks:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31477 npm run test:components -- tests/components/referee-panel.spec.ts --workers=2
```

This evidence does not establish full-site/all-appearance browser coverage,
live osu!/IRC acceptance, CI acceptance or deployment.
