# Player sheet redesign — #720

Reference: https://osusheets.team/bTocPKH3_6NGq_ANRFhUz (reviewed 2026-11-02).

Visual thesis: use calm MainSheet surfaces, compact aligned tables and one accent
for the active player's work; give names, maps and time the strongest hierarchy.

Content plan: pool/Mod or week/timezone controls; a shared comparison table;
inline personal inputs; one nearby save/undo area and short status legend.

Interaction thesis: fixed identity columns preserve context while scrolling;
continuous drag previews show the painted time range; immediate local updates
and restrained focus/hover feedback make edits clear. Respect reduced motion.

The timetable uses existing authorized reads: captains see the current eligible
roster, other players see themselves. Each actor still writes only their own data.
The practice comparison uses the existing current-team practice read model.

Add optional states to the existing private season interval JSON. Omitted state
means available, preserving legacy values. Uncertain/unavailable remain explicit;
unfilled is absence, and fixture scheduling retains its separate contract. No DB
DDL or production operation is needed. UTC instants remain authoritative;
local/UTC changes regenerate dated half-hour columns, including repeated DST hours.

Verification includes interval replacement, mixed/partial existing intervals,
non-overlap, DST days, midnight/week changes, authorized ownership and idempotent
persistence, followed by check/test/build/i18n and focused synthetic UI coverage.

## Follow-up #731 — score/comment and quieter tables

Visual thesis: compact, aligned MainSheet tables with restrained borders, clear
identity columns and continuous availability bands; make editable values the focus.
Content plan: one pool/Mod toolbar or week/timezone toolbar, comparison grid,
nearby personal save/status controls, and optional help/full-comment disclosures.
Interaction thesis: fixed names/maps and time headers preserve position; long
comments expand on demand; weekday shortcuts and continuous drag feedback keep
navigation and painting immediate. Focus the selected day initially and retain
a full-week overview. Keep focus and reduced-motion behavior clear.

Practice has score/Feel/comment following the organizer's next request. Feel uses
an optional compact Poor/Okay/Good selection beside the score; on mobile the
comment occupies a full-width second row. Keep Feel secondary in saved records.
Retire rating from current commands and read
projections while retaining legacy storage/audit. Remove stale rating UI and tests;
verify legacy records still expose score/comment and reject retired command fields.

The next follow-up adds each map's official beatmapset cover behind the fixed
identity column. Keep the artwork secondary to literal map details and controls;
reuse BeatmapCover's decorative image and failure behavior without adding row
height, shifting the editor or introducing another click target.

## Compact in-cell follow-up — 2026-11-03

Visual thesis: a dense, calm comparison sheet with a small artwork identity band
and light input borders; each map occupies one row rather than a display/editor
pair. Content plan: fixed map identity with a linked title, compact direct/Copy
BID controls, the actor's editable cell first, then teammate saved comparisons.
Interaction thesis: edit in place without mounting a separate row; retain drafts
across Mods and preserve safe save/delete retries; show copy feedback and reveal
previous map context on demand. Touch controls keep 44px targets.

The organizer's BID reference uses a purple rounded capsule with a bold literal
number and copy icon. Keep the number visible through success/error states and
fit a seven-digit ID into the narrow map column without widening the editor.

## Friday–Monday timetable follow-up — 2026-11-03

Show only Friday, Saturday, Sunday and the following Monday in the shortcuts
and overview. Use a consecutive four-date group rather than filtering an ISO
week into a misleading Monday-first order. Midweek date/Today navigation locates
the upcoming Friday; keep the selected weekday when shifting groups. Apply the
group in the display timezone without mutating or filtering stored intervals.
Retain all old midweek ranges and drafts when saving allowed-day edits.
