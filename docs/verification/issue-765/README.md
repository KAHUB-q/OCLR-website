# IRC help and connection management (#765)

The IRC console removes the two requested explanatory paragraphs and retains
the download help and three setup steps. Manage connections is now a button
beside Open OCLR IRC, pointing to the existing `/desktop/sessions` page. Both
controls stay on the same row at 320px; management remains available when IRC
is connected, and simulation keeps its existing scope.

| Synthetic capture | Light                            | Dark                            |
| ----------------- | -------------------------------- | ------------------------------- |
| Desktop           | [IRC console](desktop-light.png) | [IRC console](desktop-dark.png) |
| 320px mobile      | [IRC console](mobile-light.png)  | [IRC console](mobile-dark.png)  |

Eight focused Chrome component tests passed. They cover three locales and both
themes on desktop/mobile (12 combinations), plus connected and simulation
states. Checks verify button order and geometry, 44px control height, keyboard
focus, retained setup steps, removed copy, management/download/deep-link URLs,
and no page overflow. All 12 Axe checks of the control row reported no violations.

These are captures of the actual client component with synthetic HTTP fixtures.
Tests inspect links without launching the desktop app, navigating to session
management, downloading files, or changing real connections.

Reproduce using Node 24 and the configured Chrome channel:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31469 npm run test:components -- tests/components/referee-panel.spec.ts --grep 'IRC help' --workers=2
```

This focused evidence does not establish full-site/theme browser coverage,
current CI acceptance, or deployment.
