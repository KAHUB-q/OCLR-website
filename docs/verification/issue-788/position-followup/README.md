# Historical selector position follow-up

2026-11-04, following the organizer's screenshot: the selected pool title now
appears before **Choose from historical mappools**, with **Publish pool** below
the selector. The header keeps a full-width grid column when this selector is
present. Existing selector visibility, state, permissions and mutations are reused.

Verified against the actual `MappoolEditor` in the existing DB-free component
host with synthetic data and a mocked historical-pool read. Node 24.22.2:

- 12/12 combinations: 1440px desktop / 320px mobile × en / zh-Hans / zh-Hant ×
  light / dark.
- Both collapsed and expanded geometry confirms title → selector → publication
  order, full available selector width and no horizontal page overflow.
- Keyboard Enter opens/closes the selector, and map checkboxes remain usable.
- Changed TypeScript/TSX ESLint, Prettier and `git diff --check` passed.
- [Desktop/light](desktop-light.png), [mobile/dark](mobile-dark.png) and
  [measured results](results.json). Both screenshots were visually inspected.

This is a focused layout verification. It adds no application behavior or
interface messages and does not repeat the full application/DB/browser suite.
