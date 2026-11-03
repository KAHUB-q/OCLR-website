# Compact referee preview and connection controls (#770)

The Ban/Pick preview uses one chronological column with the existing red/blue
team colors. Every numbered step shares the same left edge; long team names
wrap, and TB remains neutral with its score. The two column headings and the
applied-order caption are removed. Unsaved order changes still show their
existing warning until discarded or saved.

Open OCLR IRC and Manage connections use content-sized controls, 12px labels
and 32px desktop height. Coarse pointers retain a 44px touch target. Both links
stay on the same row at the reported 877px viewport and at 320px mobile width.
The saved deep link and `/desktop/sessions` destinations are preserved.

| Synthetic capture | Light                                | Dark                                |
| ----------------- | ------------------------------------ | ----------------------------------- |
| 877px preview     | [Preview](desktop-light-preview.png) | [Preview](desktop-dark-preview.png) |
| 877px IRC         | [Console](desktop-light-irc.png)     | [Console](desktop-dark-irc.png)     |
| 320px IRC         | [Console](mobile-light-irc.png)      | [Console](mobile-dark-irc.png)      |

All 64 affected desktop/mobile component cases passed. The 12 preview cases
were repeated after adding a check that every row, including TB, fits inside
the list bounds. The preview and control
checks cover three locales in both themes, including column geometry, colors,
long names, changing/discarding order previews, saved-caption removal, compact
button dimensions, keyboard focus, destinations and page overflow. The 24
affected preview/control Axe checks found no violations. Existing MP sync,
command scrolling, retries, read-only and simulation cases also passed.

These are actual component captures using synthetic fixtures and HTTP
responses. They do not establish full-site or all-appearance browser coverage,
live osu!/IRC acceptance, CI acceptance or deployment.

Reproduce with Node 24 and the configured Chrome channel:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31474 npm run test:components -- tests/components/referee-panel.spec.ts --workers=2
```
