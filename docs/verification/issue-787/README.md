# #787 Scoreboard sync control placement

Verified on 2026-11-04 (Asia/Taipei). Automatic sync now appears at the right end of the scoreboard header, after the existing EX/withdraw controls. The MP component exposes its existing control and feedback through a render callback, so the same binding/polling state drives the header button and the lower MP link, timestamp, error and review details. No portal, duplicated sync state or provider/API change was introduced.

- 24 Chromium geometry cases passed: 320/390/877/1280 px × zh-Hans/zh-Hant/en × light/dark. The sync control remained right-aligned, at least 44 px high, above its feedback, without document horizontal overflow. Keyboard Enter enabled the binding once.
- Existing targeted desktop/mobile component tests passed **18/18**, including reload, offline saved-room binding, stop during room change, lost-bind recovery, errors, read-only/simulation exclusion, stale-response fencing and accessible review lists. The existing pinned-score/withdraw tests passed another **2/2**.
- Final build, ESLint/type checks and the merged-main read-API generation/check passed. Read API generation produced no tracked differences. Existing translations were retained; catalogs were already verified by the related referee/i18n unit checks.

Screenshots: [desktop light](desktop-light.png), [mobile dark](mobile-dark.png); [geometry results](results.json). The temporary fixture used synthetic data/HTTP; initial fixture locator and asynchronous assertion issues were corrected before the passing run. No live room, production database or full appearance/E2E matrix was used.
