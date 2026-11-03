# Ban / Pick preview columns (#763)

The preview uses the existing referee mapping: `teams[1]` is red on the left,
and `teams[0]` is blue on the right. Every policy step occupies a separate row
in chronological order, including consecutive steps by the same team. Neutral
TB steps span both columns and retain the tied score. Unsaved order changes
update the preview without a write request.

These captures show the actual client component with synthetic team names,
including intentionally long Chinese/Latin names. They contain no production
fixture or account data. The sample starts with the blue team; changing the
first Ban team moves that step to the red column without changing its number.

| Capture      | Light                        | Dark                        |
| ------------ | ---------------------------- | --------------------------- |
| Desktop      | [Preview](desktop-light.png) | [Preview](desktop-dark.png) |
| 320px mobile | [Preview](mobile-light.png)  | [Preview](mobile-dark.png)  |

Chrome component checks passed in 12 combinations: desktop/mobile × three
locales × light/dark. Checks cover column geometry, chronological row order,
consecutive same-team actions, long-name wrapping without page overflow,
order changes, unresolved actors, neutral TB, zero write requests, and Axe
accessibility checks with no violations.

Reproduce from this checkout with Node 24 and the configured Chrome channel:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31467 npm run test:components -- tests/components/referee-panel.spec.ts --grep 'BP preview keeps' --workers=2
```

This is focused synthetic component evidence. It does not establish the full
site/theme browser matrix, current CI acceptance, or deployment.
