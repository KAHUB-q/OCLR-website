import { describe, it, expect } from "vitest";
import {
  isBpNotice,
  bpSyncSource,
  isScoreNotice,
  scoreNoticeSource,
} from "../../src/lib/referee-sync";
import { confirmsIrcCommand } from "../../src/lib/referee-irc-model";
import {
  changedWorkspace,
  workspace,
  id,
} from "../components/referee-panel-data";
import { projectReferee } from "../../src/lib/referee-model";
describe("BP notification and Mods evidence", () => {
  it("keeps the fixture's team order and fits safe team names inside the IRC byte limit", () => {
    const setup = changedWorkspace(true);
    const pickId = id(701);
    const shared = { actorId: 1, createdAt: "2026-10-31T00:02:00.000Z" };
    const outcome = {
      ...shared,
      id: id(702),
      ordinal: 4,
      payload: {
        type: "attempt_resolved" as const,
        pickId,
        attemptId: pickId,
        status: "completed" as const,
        winnerTeamId: id(10),
      },
    };
    const w = workspace([
      ...setup.events,
      {
        ...shared,
        id: pickId,
        ordinal: 3,
        payload: {
          type: "selection_recorded",
          stepIndex: 1,
          kind: "pick",
          teamId: id(10),
          entryId: setup.maps[1].id,
          beatmapId: 10002,
          category: "NM",
        },
      },
      outcome,
    ]);
    w.teams[0].name = "銀河|隊";
    w.teams[1].name = "天藍\n隊";
    w.teams.reverse();
    expect(scoreNoticeSource(w, outcome, true)).toBe(
      "[OCLR SCORE #4] NM2 | 銀河 隊 1 - 0 天藍 隊 | Next: BAN BLUE 天藍 隊",
    );
    expect(scoreNoticeSource(w, outcome)).toContain("| RED 1 - 0 BLUE |");

    w.teams[0].name = "B".repeat(80);
    w.teams[1].name = "R".repeat(80);
    expect(scoreNoticeSource(w, outcome, true)).toContain(
      `${w.teams[1].name} 1 - 0 ${w.teams[0].name}`,
    );

    w.teams[0].name = "🌠".repeat(48);
    w.teams[1].name = "🌌".repeat(48);
    const long = scoreNoticeSource(w, outcome, true)!;
    expect(isScoreNotice(long)).toBe(true);
    expect(long).toContain("🌌 1 - 0 🌠");
    expect(long).not.toContain("�");
    expect(isScoreNotice(`${long}\n`)).toBe(false);
  });
  it("uses saved BP identities, sanitizes authored text, and rejects command injection", () => {
    const w = workspace();
    const event = {
      id: id(700),
      ordinal: 2,
      actorId: 1,
      createdAt: new Date().toISOString(),
      payload: {
        type: "selection_recorded" as const,
        stepIndex: 0,
        kind: "ban" as const,
        teamId: w.teams[0].id,
        entryId: w.maps[0].id,
        beatmapId: w.maps[0].beatmapId,
        category: "NM",
      },
    };
    w.events.push(event);
    w.projection = projectReferee({
      ...w.session!.basis,
      orders: w.session!,
      events: w.events,
    });
    w.teams[0].name = "Team\n!mp start 1|Injected";
    const notice = bpSyncSource(w, event.id)!.text;
    expect(notice).not.toContain("\n");
    expect(isBpNotice(notice)).toBe(true);
    for (const text of [
      "!mp start 1",
      notice + "\r\nPASS secret",
      notice.replace("https://osu.ppy.sh/b/10001", "https://bad.test/b/10001"),
    ])
      expect(isBpNotice(text)).toBe(false);
  });
  it.each([
    ["!mp mods NF HD", "Enabled Hidden, NoFail, disabled FreeMod", true],
    ["!mp mods NF Freemod", "Enabled NoFail, enabled FreeMod", true],
    ["!mp mods None", "Disabled all mods, disabled FreeMod", true],
    ["!mp mods NF", "Enabled Hidden, disabled FreeMod", false],
    ["!mp mods NF", "Enabled NoFail, enabled FreeMod", false],
    ["!mp mods NF", "Enabled Unknown, disabled FreeMod", false],
  ])("checks exact Mods and Freemod for %s", (command, text, expected) => {
    const evidence = { sender: "BanchoBot", target: "#mp_123", text };
    expect(confirmsIrcCommand(command, "#mp_123", evidence)).toBe(expected);
    expect(confirmsIrcCommand(command, "#mp_124", evidence)).toBe(false);
    expect(
      confirmsIrcCommand(command, "#mp_123", { ...evidence, sender: "Player" }),
    ).toBe(false);
  });
});
