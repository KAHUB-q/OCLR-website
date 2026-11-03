# Command status auto-scroll (#767)

New command IDs expand command status and scroll the IRC log to its newest
entry after rendering. This covers manual sends, automatic BP notifications,
and commands received through polling. Receipt-only updates keep the reading
position. The log retains a bounded set of recent IDs so transient failed or
stale views do not repeatedly trigger scrolling. Existing simulated-send
scrolling remains in place.

Four focused Chrome cases passed across desktop/mobile, including a full
50-command history where the count stays unchanged as a new ID arrives.
They verify manual sends, BP notices, polled commands, receipt-only updates,
reopening collapsed status, and unchanged page scroll position. The final
integrated referee component suite passed all 64 cases, including BP preview,
MP automatic sync, IRC copy/buttons, simulation, retry and read-only behavior.

The mobile console grows with its controls and keeps a bounded log height.
This prevents controls from squeezing the log down to padding alone. The
scroll checks also require at least 96px of visible log space and the entire
latest command inside it; the final mobile capture below replaces the earlier
padding-only capture. Final lint/types and production build passed. The full
unit/integration run before this CSS-only follow-up passed 2,349 tests with two
skipped in the isolated test database, which was stopped afterward.

- [Desktop latest entry](desktop-latest-command.png)
- [Mobile latest entry](mobile-latest-command.png)

These are actual component captures using synthetic command history and HTTP
fixtures. No real IRC command or business write was sent.

Reproduce with Node 24 and the configured Chrome channel:

```sh
PLAYWRIGHT_CHANNEL=chrome COMPONENT_TEST_PORT=31469 npm run test:components -- tests/components/referee-panel.spec.ts --grep 'new manual commands|new command IDs' --workers=2
```

This evidence does not establish full-site/theme browser coverage, current CI
acceptance, or deployment.
