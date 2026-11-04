# #780 Neutral TieBreaker Pick

Verified on 2026-11-04 (Asia/Taipei), following #778 on `codex/compact-post-match-review`, with Node.js 24.22.2.

The reserved TB map and the active TieBreaker step use one neutral **Pick** action. The button has no red/blue team styling, and the existing `record_selection` action continues to derive the neutral TB identity from the configured policy. Ordinary Ban/Pick steps retain their team controls. Existing rule validation, readiness, stale dependencies, pending writes and read-only access still determine whether selection is allowed. The new contextual translation key keeps the organizer-requested “Pick” label in all three locales, avoiding the unrelated draft “Pick” translation.

## Evidence

A temporary browser host bundled the actual referee panel with the existing synthetic workspace fixture. Mock HTTP responses used the real `validateRefereeAction` and workspace projection; no live accounts, IRC room, provider or database was used.

- 24 Chromium cases passed: 320/390/877/1280 px × zh-Hans/zh-Hant/en × light/dark. Each TB row had exactly one neutral Pick button, at least 44 px high, with no document horizontal overflow or browser runtime error.
- TB selection stayed disabled before the configured tied-score step and for read-only access. Ordinary team controls remained present at the ordinary Ban stage.
- Keyboard Enter sent one `record_selection` request for the TB map without a client-supplied team. The server model produced `kind: "tb"`, `teamId: null`, and a neutral selection projection.
- `npm run i18n:extract` and `npm run test:i18n` passed. Referee model, sync, referee localization and catalog tests: **4 files / 38 tests passed**. ESLint for both changed components, Prettier and `git diff --check` passed.
- Shared broader checks and the initial sandbox failures/recovery are recorded in [#778 verification](../issue-778/README.md).
- The final `npm run build` passed, including the Next.js TypeScript check and all 30 generated static pages.

Screenshots: [desktop light](desktop-light.png), [mobile dark](mobile-dark.png). [Case results](results.json).

No full-site E2E suite or appearance matrix was run. DB-backed integration, live Bancho/provider acceptance, CI and production deployment are separate evidence; this report establishes the affected synthetic component behavior only.
