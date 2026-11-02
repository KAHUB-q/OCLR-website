# Player workspace sidebar (#713)

Implemented from main `4f79c2f5` on `codex/player-sidebar-toggle`.
The private player and captain workspaces share a hamburger beside the edition
name. Desktop starts expanded and can reclaim the sidebar's width; mobile starts
collapsed and closes after selecting a destination. Escape in the menu or on its
trigger closes the mobile sidebar and restores trigger focus. Toggling preserves
the mounted page, including unsaved input. Desktop and mobile choices are
independent across breakpoint changes.

The existing localized `Menu` message, MainSheet button materials and role-scoped
navigation are reused. Public tournament navigation, presenter and OBS layouts
retain their existing rendering. This change adds no messages, authorization,
business writes, persisted preferences or migrations.

## Verification — 2026-11-02 (Asia/Taipei)

Node.js 24.22.2; `npm ci` with the committed lockfile.

- `npm run check`: passed (ESLint, route generation and TypeScript).
- `npm run build`: passed (production compilation, types and page generation).
- `npm test`: 1,577 passed, 706 skipped; no isolated PostgreSQL test target was
  provided.
- `COMPONENT_TEST_PORT=31513 npm run test:components -- tests/components/player-sidebar.spec.ts --workers=2`:
  8 passed on desktop and mobile Chromium. Covers expanded/collapsed geometry,
  preserved input, keyboard tab order, player/captain navigation, Escape/focus,
  320px screens, long names, all three locales, light/dark and broadcast/public
  boundaries. Representative expanded/collapsed screenshots were inspected.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm run read-api:check`: 57 contracts, 181 coverage rows and 8 tests passed.
- Prettier and `git diff --check`: passed.

The browser host uses actual components, styles and catalogs with synthetic data
and simulated client routing. It does not establish live authentication or
server authorization. Full application/DB E2E and full appearance/browser
matrices were not run. The final commit and actual CI status are recorded on
[#713](https://github.com/OCLR-dev/OCLR-website/issues/713)
and the linked PR. Local verification and merge do not establish deployment.
