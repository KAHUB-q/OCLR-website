# #784 NF FreeMod room acknowledgement

Verified on 2026-11-04 (Asia/Taipei), alongside OCLR-IRC #118.

The organizer supplied the actual BanchoBot reply `Disabled all mods, enabled FreeMod` after `!mp mods NF Freemod`. Both the desktop and website previously required NF to remain in the returned global Mods list, leaving that acknowledgement unconfirmed.

The website now accepts an enabled FreeMod reply that matches every requested global Mod except an omitted, requested NF. It also retains support for replies that explicitly include NF. DT and other requested Mods still must match, and the FreeMod state must agree. This is confirmation of the room setting only; it does not verify individual NF, lineup or scoring compliance.

The added positive and negative tests cover the supplied reply, NF+DT FreeMod, the previous NF reply, missing DT, disabled FreeMod, unexpected NF/HR, unknown Mods, non-Bot text and another room. **4 files / 77 tests passed** in the affected referee model, sync, IRC and i18n run. The combined final build (including TypeScript), ESLint and formatting checks passed.

The desktop fix is separately tracked in [OCLR-IRC #118](https://github.com/OCLR-dev/OCLR-IRC/issues/118); both sides need the new source for the complete path. This report uses the organizer-provided reply plus synthetic tests. No production credentials, database, live room mutations, deployment or full-site E2E suite were used. The independent room-settings/unknown-operation work remains with [#779](https://github.com/OCLR-dev/OCLR-website/issues/779).
