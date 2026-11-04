# #778 Compact post-match reconciliation

Verified on 2026-11-04 (Asia/Taipei), based on main `7c2b6890`, with Node.js 24.22.2 and the existing npm lockfile.

The reconciliation component now uses a compact header, shared score/status summary and divided attempt rows. Each row keeps the recorded attempt, result comparison and exact MP-game controls together. On wider containers the selector and save action sit alongside the attempt; narrow containers stack them. Local CSS replaces the nested `form-stack` margins and panel padding, using the existing MainSheet colors. Existing messages, request payloads, permissions and retry behavior are retained.

## Browser verification

A temporary loopback-only host bundled the actual client component and application styles. HTTP responses and all identities, attempts and MP sources were synthetic; no database, credentials or production services were used.

- 48 Chromium layout cases passed: 320/390/877/1280 px × zh-Hans/zh-Hant/en × light/dark × normal/long team names. No document horizontal overflow; reconciliation buttons, links and selects retain at least 44 px height.
- Three attempts, including repeated plays of the same map, remained separate. Empty, read-only and published-revision views rendered correctly.
- Exact game selection, save, uncertain-response retry with the same request key and payload, refresh, history expansion and the existing MP review destination passed.
- Scoped axe WCAG 2 A/AA and 2.1 AA checks found no violations. No browser runtime errors were recorded. Initial temporary-harness checks required an explicit Playwright browser context and component scope; those harness issues were corrected before the final pass.
- At 1100 px, the same three-attempt sample changed from 1763.39 px to 581.75 px high (67% reduction). This is a controlled component comparison, not a claim about every real match or appearance.

Screenshots: [before](before-desktop-light.png), [desktop light](after-desktop-light.png), [desktop dark](after-desktop-dark.png), [mobile light](after-mobile-light.png). Machine-readable geometry and case results: [results.json](results.json).

## Application checks and limits

- `npm ci`, `npm run check` and `npm audit --omit=dev` passed; production audit reported zero vulnerabilities.
- The initial `npm test` run reported 194 files / 1614 tests passed, 72 files / 725 tests skipped, and five failed files. The failures were sandbox restrictions on loopback/socket listeners and Bash `/dev/fd` use. All five files were rerun outside that sandbox together with the referee model, reconciliation and sync unit tests: **8 files / 91 tests passed**.
- No `TEST_DATABASE_URL` was configured in this isolated worktree; database-backed integration cases were skipped. No full-site browser suite or appearance matrix was run. This UI report does not establish current CI, deployment or live-provider acceptance.
