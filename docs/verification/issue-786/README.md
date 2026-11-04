# #786 Current-step team identity

Verified on 2026-11-04 (Asia/Taipei). The current BP step now includes the localized red/blue side before the literal team name and uses the existing light/dark team colors. The side comes from the fixture team identity, independently of the Ban/Pick order. Neutral TB and unset teams retain neutral text.

The actual referee panel passed 48 Chromium cases: 320/390/877/1280 px × zh-Hans/zh-Hant/en × light/dark × red/blue first Ban, with long synthetic team names. The expected side label and computed color matched, no horizontal document overflow or runtime error occurred, and the TB case stayed neutral. Screenshots: [red light](red-light.png), [blue mobile dark](blue-mobile-dark.png); [results](results.json).

Existing translation catalogs were reused; extraction made no catalog changes. Five affected referee/IRC/i18n unit files passed (81 tests). This is synthetic UI evidence, not a live tournament or full appearance-matrix acceptance.
