# #782 Referee pool Mods colors

Verified on 2026-11-04 (Asia/Taipei), following #778/#780 on `codex/compact-post-match-review`.

The referee pool's category headings and full map codes now follow the organizer's supplied palette: NM blue, HD gold, HR red, DT purple, TB pink. This palette is scoped to the referee pool because the existing global mod badge table uses different colors. Team action colors, BP history and the neutral TB Pick action keep their own meaning. FM and unknown categories inherit the existing MainSheet text color.

Light and dark shades preserve readable text on both the normal panel and the selected-row surface. **24 Chromium cases passed**: 320/390/877/1280 px × zh-Hans/zh-Hant/en × light/dark, each including all five requested categories plus FM and an unknown category. The lowest measured text contrast was **4.61:1** across the panel and selected surfaces. No document horizontal overflow or runtime errors were recorded; TB retained a single neutral Pick. Sticky elements were disabled only in the temporary screenshot fixture to isolate the complete pool.

Screenshots: [desktop light](desktop-light.png), [mobile dark](mobile-dark.png). [Measured colors and cases](results.json).

The combined final build passed, including Next.js TypeScript. Affected referee/IRC/i18n unit checks passed (4 files / 77 tests), and ESLint passed for the changed component and IRC model. Shared broader checks and environment limits are recorded in [#778 verification](../issue-778/README.md). No full appearance matrix, database integration or live tournament operation was performed for this styling change.
