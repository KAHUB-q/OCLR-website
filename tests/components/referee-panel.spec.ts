import { test, expect, type Page } from "@playwright/test";
import { bpSyncSource } from "../../src/lib/referee-sync";
import { workspace, id } from "./referee-panel-data";
import { validateRefereeAction } from "../../src/lib/referee-model";
import type { IrcMessage } from "../../src/lib/referee-irc-model";
import type { RefereeMpView } from "../../src/lib/referee-mp";
import AxeBuilder from "@axe-core/playwright";
import en from "../../messages/en.json" with { type: "json" };
import hans from "../../messages/zh-Hans.json" with { type: "json" };
import hant from "../../messages/zh-Hant.json" with { type: "json" };
const api = "**/api/admin/tournaments/synthetic/matches/*/referee";
async function setup(
  page: Page,
  options: {
    connected?: boolean;
    failure?: "lost" | "conflict" | "syncLost";
    delay?: boolean;
    roomId?: number;
    messages?: IrcMessage[];
  } = {},
) {
  let current = workspace();
  const snapshot = () =>
    new URL(page.url()).searchParams.has("readonly")
      ? { ...current, canRecord: false }
      : current;
  let syncLost = false;
  const writes: Record<string, unknown>[] = [],
    queues: Record<string, unknown>[] = [],
    autos: string[] = [];
  const receipts = new Map<string, { eventId: string; requestKey: string }>();
  const commands: {
    id: string;
    requestKey: string;
    text: string;
    target: string;
    status: string;
    recordError: null;
    createdAt: string;
  }[] = [];
  await page.route(`${api}/mp`, (r) =>
    r.fulfill({ json: { binding: null, workspace: snapshot() } }),
  );
  await page.route(`${api}/reconciliation`, (r) =>
    r.fulfill({
      status: 409,
      json: { error: "The action could not be completed." },
    }),
  );
  await page.route(`${api}/irc`, async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      if (body.action === "sync_selection") {
        if (!options.connected) {
          await r.fulfill({
            status: 409,
            json: { error: "Connect the local IRC app to this fixture first." },
          });
          return;
        }
        if (!autos.includes(body.eventId)) {
          autos.push(body.eventId);
          const source = bpSyncSource(current, body.eventId)!;
          commands.push({
            id: id(2000 + commands.length),
            requestKey: body.eventId,
            text: source.text,
            target: "#mp_123",
            status: "queued",
            recordError: null,
            createdAt: new Date().toISOString(),
          });
        }
        if (options.failure === "syncLost" && !syncLost) {
          syncLost = true;
          await r.abort("failed");
          return;
        }
      } else {
        queues.push(body);
        commands.push({
          id: id(500 + commands.length),
          requestKey: body.requestKey,
          text: body.text,
          target: "#mp_123",
          status: "queued",
          recordError: null,
          createdAt: new Date().toISOString(),
        });
      }
    }
    await r.fulfill({
      json: {
        connection:
          options.connected || options.roomId !== undefined
            ? {
                id: id(400),
                roomId: options.roomId ?? 123,
                ircUsername: "SyntheticRef",
                status: options.connected ? "connected" : "disconnected",
                connected: !!options.connected,
                bpSync: true,
                lastSeenAt: new Date().toISOString(),
              }
            : null,
        messages: options.messages ?? [],
        commands,
        workspace: snapshot(),
      },
    });
  });
  await page.route(api, async (r) => {
    if (r.request().method() !== "PATCH") {
      await r.fulfill({ json: snapshot() });
      return;
    }
    const body = r.request().postDataJSON();
    writes.push(body);
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, 150));
    if (options.failure === "conflict") {
      await r.fulfill({
        status: 409,
        json: {
          error: "The referee workspace changed. Refresh before saving.",
        },
      });
      return;
    }
    let receipt = receipts.get(body.requestKey);
    if (!receipt) {
      const payload = validateRefereeAction(
        {
          ...current.session!.basis,
          orders: current.session!,
          events: current.events,
        },
        body,
      );
      const event = {
        id: id(1000 + current.events.length),
        ordinal: current.events.length + 1,
        actorId: 1,
        createdAt: new Date().toISOString(),
        payload,
      };
      current = workspace([...current.events, event]);
      receipt = { eventId: event.id, requestKey: body.requestKey };
      receipts.set(body.requestKey, receipt);
    }
    if (options.failure === "lost" && writes.length === 1) {
      await r.abort("failed");
      return;
    }
    await r.fulfill({ json: { receipt, workspace: current } });
  });
  return { writes, queues, autos, commands, current: () => current };
}
function pool(page: Page) {
  return page.getByRole("region", { name: "Round mappool", exact: true });
}
function poolTile(page: Page, code: string) {
  return pool(page).getByRole("button", { name: code, exact: true });
}
async function recordPoolMap(page: Page, code: string, action: string) {
  await poolTile(page, code).click();
  await pool(page).getByRole("button", { name: action, exact: true }).click();
}
function records(page: Page) {
  return page.getByRole("region", { name: "Referee records", exact: true });
}
function savedIrcCommand(
  number: number,
  text = `Synthetic command ${number}: https://osu.ppy.sh/b/10001`,
) {
  return {
    id: id(8000 + number),
    requestKey: id(9000 + number),
    text,
    target: "#mp_123",
    status: "queued",
    recordError: null,
    createdAt: new Date().toISOString(),
  };
}
async function expectLatestCommand(page: Page) {
  const log = page.getByRole("log", {
    name: "IRC room projection",
    exact: true,
  });
  await expect
    .poll(() =>
      log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop),
    )
    .toBeLessThanOrEqual(2);
  await expect
    .poll(() =>
      log.evaluate((el) => {
        const pane = el.getBoundingClientRect();
        const latest = el.querySelector("details > div:last-child");
        if (!latest) return false;
        const row = latest.getBoundingClientRect();
        return row.top >= pane.top && row.bottom <= pane.bottom;
      }),
    )
    .toBe(true);
  return log;
}
test("new manual commands and automatic BP notices scroll command status to the newest entry", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  state.commands.push(
    ...Array.from({ length: 20 }, (_, i) => savedIrcCommand(i)),
  );
  await page.goto("/referee-panel?theme=light");
  const log = await expectLatestCommand(page);
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.getByLabel("IRC command", { exact: true }).fill("!mp timer 30");
  await page
    .getByRole("button", { name: "Send to local IRC", exact: true })
    .click();
  await expect(log.locator("details code").last()).toHaveText("!mp timer 30");
  await expectLatestCommand(page);
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  await recordPoolMap(page, "NM1", "Red team BAN");
  await expect.poll(() => state.autos.length).toBe(1);
  await expect(log.locator("details code").last()).toHaveText(
    state.commands.at(-1)!.text,
  );
  await expectLatestCommand(page);
});
test("new command IDs scroll even with a full 50-row history, while receipt updates preserve reading position", async ({
  page,
}, info) => {
  const state = await setup(page, { connected: true });
  state.commands.push(
    ...Array.from({ length: 50 }, (_, i) => savedIrcCommand(i)),
  );
  await page.goto("/referee-panel");
  const log = await expectLatestCommand(page);
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  const scrollY = await page.evaluate(() => window.scrollY);
  state.commands.shift();
  state.commands.push(savedIrcCommand(51, "Newest polled command"));
  await expect(log.locator("details code").last()).toHaveText(
    "Newest polled command",
  );
  await expectLatestCommand(page);
  expect(state.commands).toHaveLength(50);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  state.commands.at(-1)!.status = "confirmed";
  await expect(
    log.locator("details > div").last().locator("small").first(),
  ).toHaveText("Confirmed by IRC");
  expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
  await log.locator("details").evaluate((el) => {
    (el as HTMLDetailsElement).open = false;
  });
  state.commands.shift();
  state.commands.push(
    savedIrcCommand(52, "Newest command after collapsed history"),
  );
  await expect(log.locator("details code").last()).toHaveText(
    "Newest command after collapsed history",
  );
  await expect(log.locator("details")).toHaveJSProperty("open", true);
  await expectLatestCommand(page);
  await log.screenshot({ path: info.outputPath("latest-command.png") });
});
for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
  const theme = "light";

  test(`BP preview keeps team colors in one chronological column — ${locale} ${theme}`, async ({
    page,
    isMobile,
  }, info) => {
    await page.setViewportSize(
      isMobile ? { width: 320, height: 844 } : { width: 877, height: 819 },
    );
    const catalog =
      locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en;
    const text = (source: string) =>
      catalog.ui[
        Object.entries(en.ui).find(
          ([, value]) => value === source,
        )![0] as keyof typeof en.ui
      ];
    const state = await setup(page);
    state.current().teams[0].name =
      "Red Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    state.current().teams[1].name =
      "Blue Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    await page.goto(`/referee-panel?locale=${locale}&theme=${theme}&longnames`);
    await expect(
      page.getByText(text("Showing applied order"), { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(text("Order preview — not saved"), { exact: true }),
    ).toHaveCount(0);
    await page
      .getByText(text("Preview Ban / Pick sequence"), { exact: true })
      .click();
    const list = page.getByRole("list", {
      name: text("Preview Ban / Pick sequence"),
      exact: true,
    });
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(0)).toContainText(/1\s*BAN\s*Red Team/);
    await expect(rows.nth(1)).toContainText(/2\s*PICK\s*Red Team/);
    await expect(rows.nth(2)).toContainText(/3\s*BAN\s*Blue Team/);
    await expect(rows.nth(3)).toContainText(/4\s*PICK\s*Blue Team/);
    await expect(rows.nth(4)).toContainText(/5\s*TB/);
    await expect(rows.nth(4)).toContainText("1:1");
    async function checkRows(sides: string[]) {
      const bounds = await list.boundingBox();
      let bottom = -Infinity;
      for (const [index, side] of sides.entries()) {
        const row = rows.nth(index);
        await expect(row).toHaveAttribute("data-team", side);
        const box = await row.locator(":scope > div").boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(bottom);
        bottom = box!.y + box!.height;
        expect(bottom).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
        expect(Math.abs(box!.x - bounds!.x)).toBeLessThan(1);
        expect(Math.abs(box!.width - bounds!.width)).toBeLessThan(1);
        if (side !== "neutral") {
          const color =
            side === "red" ? "rgb(185, 28, 28)" : "rgb(29, 78, 216)";
          await expect(row).toHaveCSS("color", color);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    // Consecutive steps by the same team must each occupy their own row.
    await checkRows(["red", "red", "blue", "blue", "neutral"]);
    const accessibility = await new AxeBuilder({ page })
      .include("details:has(ol[role='list'])")
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await list.screenshot({
      path: info.outputPath(`${locale}-${theme}-preview.png`),
    });
    await page
      .getByLabel(text("First Ban team"), { exact: true })
      .selectOption(id(11));
    await checkRows(["blue", "red", "red", "blue", "neutral"]);
    await expect(
      page.getByText(text("Order preview — not saved"), { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(text("First Ban team"), { exact: true })
      .selectOption("");
    await expect(rows.nth(0)).toHaveAttribute("data-team", "neutral");
    await page
      .getByRole("button", {
        name: text("Discard unsaved order"),
        exact: true,
      })
      .click();
    await expect(
      page.getByText(text("Order preview — not saved"), { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(text("Showing applied order"), { exact: true }),
    ).toHaveCount(0);
    expect(state.writes).toHaveLength(0);
    expect(state.queues).toHaveLength(0);
  });
}
async function setupMp(page: Page, roomId = 880001) {
  const room = { roomId };
  const state = await setup(page, room);
  const changes: Record<string, unknown>[] = [];
  let binding: RefereeMpView["binding"] = null;
  let loseBind = false,
    failStatus = false;
  let heldStatus: { started: () => void; wait: Promise<void> } | null = null;
  await page.route(`${api}/mp`, async (route) => {
    const command = route.request().postDataJSON();
    if (command.action === "status" && heldStatus) {
      const held = heldStatus;
      held.started();
      await held.wait;
    }
    if (command.action === "status" && failStatus) {
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return;
    }
    if (command.action === "bind_room") {
      changes.push(command);
      expect(command.expectedRoomId).toBe(room.roomId);
      expect(command.match).toBeUndefined();
      binding = {
        matchId: room.roomId,
        revision: (binding?.revision ?? 0) + 1,
        enabled: true,
        lastCheckedAt: null,
        nextPollAt: new Date(Date.now() + 60000).toISOString(),
        error: null,
        issues: [],
        issueCount: 0,
        syncing: false,
      };
      if (loseBind) {
        loseBind = false;
        await route.abort("failed");
        return;
      }
    } else if (command.action === "unbind") {
      changes.push(command);
      binding = {
        ...binding!,
        revision: binding!.revision + 1,
        enabled: false,
      };
    }
    await route.fulfill({
      json: { binding, workspace: state.current(), outcomeSources: [] },
    });
  });
  return {
    room,
    changes,
    loseNextBind: () => {
      loseBind = true;
    },
    failStatus: (value: boolean) => {
      failStatus = value;
    },
    reviewIssues: (count: number) => {
      binding!.issueCount = count;
      binding!.issues = Array.from({ length: count }, (_, index) => ({
        gameId: 880001 + index,
        beatmapId: 10001,
        reason: "replay" as const,
      }));
    },
    holdNextStatus: () => {
      let started!: () => void, release!: () => void;
      const ready = new Promise<void>((done) => {
        started = done;
      });
      const wait = new Promise<void>((done) => {
        release = done;
      });
      heldStatus = { started, wait };
      return {
        ready,
        release: () => {
          heldStatus = null;
          release();
        },
      };
    },
  };
}
test("scoreboard automatic sync uses the saved offline IRC room, survives reload and stops with the same button", async ({
  page,
}, info) => {
  const mp = await setupMp(page);
  await page.goto("/referee-panel");
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await expect(sync).toBeEnabled();
  await expect(page.getByLabel("MP link", { exact: true })).toHaveCount(0);
  await expect(page.getByText("MP result sync", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    records(page).getByRole("link", { name: "MP 880001", exact: true }),
  ).toHaveAttribute("href", "https://osu.ppy.sh/community/matches/880001");
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  expect(mp.changes.map((c) => c.action)).toEqual(["bind_room"]);
  await records(page).screenshot({
    path: info.outputPath("score-auto-sync.png"),
  });
  await page.reload();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  expect(mp.changes).toHaveLength(1);
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "false");
  expect(mp.changes.map((c) => c.action)).toEqual(["bind_room", "unbind"]);
});
test("enabled sync follows a new saved IRC room and pauses without an MP room", async ({
  page,
}) => {
  const mp = await setupMp(page);
  await page.goto("/referee-panel");
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  mp.room.roomId = 880002;
  await expect(
    records(page).getByRole("link", { name: "MP 880002", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => mp.changes.map((c) => c.expectedRoomId))
    .toEqual([880001, 880002]);
  mp.room.roomId = 0;
  await expect(
    page.getByRole("link", { name: "Rejoin room", exact: true }),
  ).toHaveCount(0);
  await expect(
    records(page).getByRole("link", { name: "MP 880002", exact: true }),
  ).toHaveCount(0);
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "false");
  await expect(sync).toBeDisabled();
});
test("stopping automatic sync remains effective when the IRC room changes during its request", async ({
  page,
}) => {
  const mp = await setupMp(page);
  await page.goto("/referee-panel");
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  const held = mp.holdNextStatus();
  await sync.click();
  await expect(
    records(page).getByRole("button", { name: "Saving…", exact: true }),
  ).toBeVisible();
  await held.ready;
  mp.room.roomId = 880002;
  await expect(
    records(page).getByRole("link", { name: "MP 880002", exact: true }),
  ).toBeVisible();
  held.release();
  await expect(sync).toHaveAttribute("aria-pressed", "false");
  expect(mp.changes.map((c) => c.action)).toEqual(["bind_room", "unbind"]);
});
test("automatic sync recovers an accepted bind with a lost response without a second bind", async ({
  page,
}) => {
  const mp = await setupMp(page);
  mp.loseNextBind();
  await page.goto("/referee-panel");
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  expect(mp.changes).toHaveLength(1);
});
test("automatic sync reports a failed status read and can be retried without a manual MP link", async ({
  page,
}) => {
  const mp = await setupMp(page);
  mp.failStatus(true);
  await page.goto("/referee-panel");
  await expect(records(page).getByRole("alert")).toBeVisible();
  mp.failStatus(false);
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  expect(mp.changes).toHaveLength(1);
});
test("automatic sync waits for a room and stays absent in read-only and simulation views", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/referee-panel");
  await expect(
    records(page).getByRole("button", { name: "Automatic sync", exact: true }),
  ).toBeDisabled();
  for (const query of ["readonly", "simulation"]) {
    await page.goto(`/referee-panel?${query}`);
    await expect(
      page.getByRole("button", { name: "Automatic sync", exact: true }),
    ).toHaveCount(0);
  }
});
test("many MP review issues scroll within the scoreboard and remain keyboard accessible", async ({
  page,
}) => {
  const mp = await setupMp(page);
  await page.goto("/referee-panel");
  const sync = records(page).getByRole("button", {
    name: "Automatic sync",
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  mp.reviewIssues(40);
  await page.reload();
  await records(page)
    .getByText("Manual review required: 40", { exact: true })
    .click();
  const issues = records(page).getByRole("list", {
    name: "Manual review required: 40",
    exact: true,
  });
  expect(await issues.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  expect((await issues.boundingBox())!.height).toBeLessThanOrEqual(193);
  await issues.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() => issues.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Referee records"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
  test(`IRC help keeps compact launch and management buttons side by side — ${locale}`, async ({
    page,
    isMobile,
  }, info) => {
    await page.setViewportSize(
      isMobile ? { width: 320, height: 844 } : { width: 877, height: 819 },
    );
    const en = (
      await import("../../messages/en.json", { with: { type: "json" } })
    ).default;
    const catalog =
      locale === "zh-Hans"
        ? (
            await import("../../messages/zh-Hans.json", {
              with: { type: "json" },
            })
          ).default
        : locale === "zh-Hant"
          ? (
              await import("../../messages/zh-Hant.json", {
                with: { type: "json" },
              })
            ).default
          : en;
    const text = (source: string) =>
      catalog.ui[
        Object.entries(en.ui).find(
          ([, value]) => value === source,
        )![0] as keyof typeof en.ui
      ];

    const theme = "light";

    await setup(page);
    await page.goto(`/referee-panel?locale=${locale}&theme=${theme}`);
    const console = page.getByRole("complementary", {
      name: text("IRC console"),
      exact: true,
    });
    const launch = console.getByRole("link", {
      name: text("Open OCLR IRC"),
      exact: true,
    });
    const manage = console.getByRole("link", {
      name: text("Manage connections"),
      exact: true,
    });
    await expect(launch).toHaveAttribute("href", /^oclr-irc:/);
    await expect(manage).toHaveAttribute("href", "/desktop/sessions");
    await expect(manage).toHaveClass(/\bbutton\b/);
    await manage.focus();
    await expect(manage).toBeFocused();
    const left = (await launch.boundingBox())!,
      right = (await manage.boundingBox())!;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    for (const [control, box] of [
      [launch, left],
      [manage, right],
    ] as const) {
      expect(box.height).toBeGreaterThanOrEqual(isMobile ? 44 : 32);
      expect(box.height).toBeLessThanOrEqual(isMobile ? 44 : 32);
      await expect(control).toHaveCSS("font-size", "12px");
      await expect(control).toHaveCSS("white-space", "nowrap");
    }
    const trigger = console.getByRole("button", {
      name: text("Connection setup"),
      exact: true,
    });
    const help = console.getByRole("dialog", {
      name: text("Connection setup"),
      exact: true,
    });
    const log = console.getByRole("log");
    const logOffset = () =>
      log.evaluate((node) => {
        const panel = node.closest("aside")!;
        return node.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      });
    const initialOffset = await logOffset();
    await expect(help).toBeHidden();
    await trigger.press("Enter");
    await expect(help).toBeVisible();
    expect(await logOffset()).toBe(initialOffset);
    const helpBox = (await help.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(helpBox.x).toBeGreaterThanOrEqual(0);
    expect(helpBox.y).toBeGreaterThanOrEqual(0);
    expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(viewport.width);
    expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(viewport.height);
    await expect(help.getByRole("listitem")).toHaveCount(3);
    for (const source of [
      "Open oclr-irc and sign in to osu! IRC locally.",
      "Authorize OCLR in the browser and select this assigned match.",
      "Confirm the accounts and enable website IRC. You can then create a room from this page.",
    ])
      await expect(help).toContainText(text(source));
    await expect(help).toContainText(
      text(
        "If the app does not open, install the latest OCLR IRC and launch it once, then try again.",
      ),
    );
    await expect(
      help.getByRole("link", { name: text("Get OCLR IRC"), exact: true }),
    ).toHaveAttribute(
      "href",
      "https://github.com/OCLR-dev/OCLR-IRC/actions/workflows/test-builds.yml",
    );
    for (const source of [
      "BP saves sync automatically: Ban announces; Pick announces, changes the map and applies saved Mods.",
      "IRC credentials stay in the desktop app. The launch link does not sign you in or send commands.",
      "Manage desktop sessions",
    ])
      await expect(
        console.getByText(text(source), { exact: true }),
      ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .include('[class*="ircLaunchActions"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${locale}-${theme}-irc-help.png`),
    });
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
test("IRC help keeps connection management available when connected and hidden in simulation", async ({
  page,
}) => {
  await setup(page, { connected: true });
  await page.goto("/referee-panel");
  const console = page.getByRole("complementary", {
    name: "IRC console",
    exact: true,
  });
  await expect(
    console.getByText("IRC connected", { exact: true }),
  ).toBeVisible();
  await expect(
    console.getByRole("link", { name: "Open OCLR IRC", exact: true }),
  ).toHaveCount(0);
  await expect(
    console.getByRole("link", { name: "Manage connections", exact: true }),
  ).toBeVisible();
  await expect(
    console.getByRole("button", { name: "Connection setup", exact: true }),
  ).toBeVisible();
  await page.goto("/referee-panel?simulation");
  await expect(
    page.getByRole("link", { name: "Manage connections", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connection setup", exact: true }),
  ).toHaveCount(0);
});
test("records Ban and Pick without an IRC connection or queue request", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel");
  await recordPoolMap(page, "NM1", "Red team BAN");
  await expect(records(page)).toContainText("BAN NM1");
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Send to local IRC", exact: true }),
  ).toBeDisabled();
  await recordPoolMap(page, "NM2", "Red team PICK");
  await expect(records(page)).toContainText("PICK NM2");
  expect(state.current().projection.activeSelections).toHaveLength(2);
  expect(state.writes.map((w) => w.action)).toEqual([
    "record_selection",
    "record_selection",
  ]);
  expect(state.queues).toHaveLength(0);
});
test("keeps queued commands and late IRC receipts independent from already recorded BP", async ({
  page,
}) => {
  const state = await setup(page, { connected: true });
  await page.goto("/referee-panel");
  await expect(page.getByText("IRC connected", { exact: true })).toBeVisible();
  await recordPoolMap(page, "NM1", "Red team BAN");
  await expect(records(page)).toContainText("BAN NM1");
  await expect.poll(() => state.autos.length).toBe(1);
  await expect(
    page.getByText("Queued for local IRC", { exact: true }),
  ).toBeVisible();
  expect(state.queues).toHaveLength(0);
  await recordPoolMap(page, "NM2", "Red team PICK");
  await expect(records(page)).toContainText("PICK NM2");
  state.commands[0].status = "confirmed";
  await expect(
    page.getByText("Confirmed by IRC", { exact: true }),
  ).toBeVisible();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(records(page)).toContainText("PICK NM2");
  expect(state.writes).toHaveLength(2);
  expect(state.current().projection.activeSelections).toHaveLength(2);
});
test("shows a conflict without preparing a command or advancing BP", async ({
  page,
}) => {
  const state = await setup(page, { failure: "conflict" });
  await page.goto("/referee-panel");
  await recordPoolMap(page, "NM1", "Red team BAN");
  await expect(
    page.getByText("The referee workspace changed. Refresh before saving.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(records(page)).not.toContainText("BAN NM1");
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
  expect(state.current().projection.activeSelections).toHaveLength(0);
  expect(state.queues).toHaveLength(0);
});
test("retries a lost save response with the same key and one selection", async ({
  page,
}) => {
  const state = await setup(page, { failure: "lost" });
  await page.goto("/referee-panel");
  await recordPoolMap(page, "NM1", "Red team BAN");
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0]).toEqual(state.writes[1]);
  expect(state.current().projection.activeSelections).toHaveLength(1);
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
});
test("blocks a second rapid click while the record is saving", async ({
  page,
}) => {
  const state = await setup(page, { delay: true });
  await page.goto("/referee-panel");
  await poolTile(page, "NM1").click();
  const button = pool(page).getByRole("button", {
    name: "Red team BAN",
    exact: true,
  });
  await button.evaluate((el: HTMLButtonElement) => {
    el.click();
    el.click();
  });
  await expect(records(page)).toContainText("BAN NM1");
  expect(state.writes).toHaveLength(1);
});
test("simulation records on click and simulated sending does not record twice", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel?simulation");
  await poolTile(page, "NM1").click();
  await pool(page)
    .getByRole("button", { name: "Red team BAN", exact: true })
    .first()
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(records(page)).toContainText("BAN NM1");
  await expect(
    page.getByText("[OCLR BP #2] BAN NM1 | Red | https://osu.ppy.sh/b/10001", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(records(page)).toContainText("BAN NM1");
  await poolTile(page, "NM2").click();
  await expect(
    pool(page)
      .getByRole("button", { name: "Red team PICK", exact: true })
      .first(),
  ).toBeEnabled();
  expect(state.writes).toHaveLength(0);
  expect(state.queues).toHaveLength(0);
});
test("read-only users cannot record", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/referee-panel?readonly");
  await poolTile(page, "NM1").click();
  await expect(
    pool(page)
      .getByRole("button", { name: "Red team BAN", exact: true })
      .first(),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

const locale = "en";

test(`records with localized feedback in ${locale} at the workflow viewport`, async ({
  page,
  isMobile,
}, info) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  const en = (
    await import("../../messages/en.json", { with: { type: "json" } })
  ).default;
  const catalog = en;
  const text = (source: string) =>
    catalog.ui[
      Object.entries(en.ui).find(
        ([, v]) => v === source,
      )![0] as keyof typeof en.ui
    ];

  const theme = "light";

  await setupMp(page);
  await page.goto(`/referee-panel?locale=${locale}&theme=${theme}`);
  const maps = page.getByRole("region", {
    name: text("Round mappool"),
    exact: true,
  });
  const score = page.getByRole("region", {
    name: text("Referee records"),
    exact: true,
  });
  const process = score
    .locator("dl > div")
    .filter({
      has: page.getByText(text("BP sequence"), { exact: true }),
    })
    .locator("dd");
  await expect(process).toHaveText("—");
  const redBan = maps.getByRole("button", {
    name: `${text("Red team")} BAN`,
    exact: true,
  });
  await expect(redBan).toHaveCount(0);
  await expect(
    maps.getByText("Synthetic Artist", { exact: false }),
  ).toHaveCount(0);
  const tbTile = poolTile(page, "TB1");
  await tbTile.click();
  const neutralPick = maps.getByRole("button", {
    name: text("Pick"),
    exact: true,
  });
  await expect(neutralPick).toBeDisabled();
  await expect(maps.getByText("Tiebreaker maps cannot be banned.")).toBeVisible();
  const firstTile = poolTile(page, "NM1");
  if (isMobile) await firstTile.click();
  else await firstTile.press("Enter");
  await expect(firstTile).toHaveAttribute("aria-expanded", "true");
  const inspector = maps.getByRole("group", { name: "NM1 · Synthetic 1" });
  await expect(inspector).toBeFocused();
  await expect(page.getByRole("complementary", { name: "IRC console" })).toBeInViewport();
  await expect(inspector).toContainText(
    "Synthetic Artist · Synthetic Difficulty",
  );
  await expect(redBan).toHaveText("R BAN");
  await expect(process).toHaveText("—");
  await redBan.click();
  await expect(
    page.getByText(
      text(
        "BP saved. IRC sync is pending. Check the connection and retry safely.",
      ),
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(inspector.getByText("Red · BAN", { exact: true })).toBeVisible();
  await expect(firstTile).toHaveAccessibleDescription("Red · BAN");
  await inspector.press("Escape");
  await expect(firstTile).toBeFocused();
  await expect(firstTile).toHaveAttribute("aria-expanded", "false");
  await expect(inspector).toBeHidden();
  const bp = page.locator("#referee-bp");
  const banOrder = bp.getByLabel("First Ban team", { exact: true });
  const orderToggle = bp.getByRole("button", { name: "Edit", exact: true });
  await expect(orderToggle).toHaveAttribute("aria-expanded", "false");
  await expect(banOrder).toBeHidden();
  await orderToggle.click();
  await expect(banOrder).toHaveValue(id(10));
  await bp.getByRole("button", { name: "Close", exact: true }).click();
  await expect(banOrder).toBeHidden();

  await poolTile(page, "NM2").click();
  const firstPick = maps.getByRole("button", {
    name: `${text("Red team")} PICK`,
    exact: true,
  });
  await expect(firstPick).toHaveText("R PICK");
  await firstPick.click();
  const outcomes = page.getByRole("region", {
    name: text("Record and correct outcomes"),
    exact: true,
  });
  const rows = outcomes.locator("ul > li > button");
  await expect(rows).toHaveText([
    /1\.\s*Red\s*BAN\s*NM1\s*Status\s*Banned/,
    /2\.\s*Red\s*PICK\s*NM2\s*Status\s*Pending/,
  ]);
  await expect(rows.nth(1).getByText("Red", { exact: true })).toHaveCSS(
    "color",
    "rgb(185, 28, 28)",
  );
  const redWin = outcomes.getByRole("button", {
    name: "Record win: Red team",
    exact: true,
  });
  await expect(redWin).toBeHidden();
  await rows.nth(1).click();
  const recordDetails = outcomes.getByRole("region", {
    name: "NM2 · Synthetic 2",
  });
  await expect(recordDetails).toBeFocused();
  await expect(recordDetails).toContainText("Normal mode");
  await expect(redWin).toHaveCSS("background-color", "rgb(185, 28, 28)");
  await expect(
    outcomes.getByRole("button", {
      name: "Record win: Blue team",
      exact: true,
    }),
  ).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await redWin.click();
  await expect(rows.nth(1)).toContainText("NM2 Winner Red");
  await recordDetails.press("Escape");
  await expect(rows.nth(1)).toBeFocused();
  await expect(redWin).toBeHidden();
  await expect(outcomes.locator("button[data-current]")).toHaveCount(0);
  await rows.nth(1).click();
  await expect(redWin).toBeVisible();
  await rows.nth(0).click();
  await expect(redWin).toBeHidden();
  await expect(score.getByLabel("Map outcomes")).toHaveText("NM2 · Red");
  await expect(
    score.getByLabel("Map outcomes").getByText("Red", { exact: true }),
  ).toHaveCSS("color", "rgb(185, 28, 28)");
  await recordPoolMap(page, "NM3", `${text("Blue team")} BAN`);
  await recordPoolMap(page, "NM4", `${text("Blue team")} PICK`);
  await expect(rows.nth(3)).toHaveText(/4\.\s*Blue\s*PICK\s*NM4/);
  await expect(rows.nth(3).getByText("Blue", { exact: true })).toHaveCSS(
    "color",
    "rgb(29, 78, 216)",
  );
  await rows.nth(3).click();
  await page
    .getByRole("button", {
      name: text("Record win: {team}").replace("{team}", text("Blue team")),
      exact: true,
    })
    .click();
  await tbTile.click();
  await neutralPick.click();
  await expect(tbTile).toHaveAttribute("data-selection", "tb");
  await expect(tbTile).toHaveAttribute("data-team", "neutral");
  const entries = process.locator(":scope > span");
  await expect(entries).toHaveText([
    "Red BAN NM1",
    "Red PICK NM2",
    "Blue BAN NM3",
    "Blue PICK NM4",
    `${text("Neutral tiebreaker")} TB TB1`,
  ]);
  const blue = "rgb(29, 78, 216)";
  const red = "rgb(185, 28, 28)";
  const selectedTiles = maps.locator(
    '[data-selection="ban"], [data-selection="pick"]',
  );
  await expect(selectedTiles).toHaveCount(4);
  for (const [index, tile] of (await selectedTiles.all()).entries()) {
    await expect(tile).toHaveCSS("border-color", index < 2 ? red : blue);
    if (index % 2 === 0) {
      await expect(tile).toHaveCSS("background-color", "rgb(227, 227, 227)");
      await expect(tile).toHaveCSS("text-decoration-line", "line-through");
    } else {
      await expect(tile).not.toHaveCSS(
        "background-color",
        "rgb(227, 227, 227)",
      );
    }
  }
  for (let index = 0; index < 4; index++)
    await expect(entries.nth(index)).toHaveCSS("color", index < 2 ? red : blue);
  await expect(entries.last()).not.toHaveCSS("color", blue);
  await expect(entries.last()).not.toHaveCSS("color", red);
  if (isMobile) {
    expect(
      await process.evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    await process.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => process.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const sync = score.getByRole("button", {
    name: text("Automatic sync"),
    exact: true,
  });
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", "true");
  const accessibility = await new AxeBuilder({ page })
    .include(`[aria-label="${text("Referee records")}"]`)
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await score.screenshot({
    path: info.outputPath(`sync-${locale}-${theme}.png`),
  });
});

test("BP columns keep the IRC log and composer visible while navigating", async ({
  page,
  isMobile,
}) => {
  if (!isMobile) await page.setViewportSize({ width: 1024, height: 800 });
  await setup(page, {
    connected: true,
    messages: Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      sender: "BanchoBot",
      text: index === 19 ? "All players are ready" : `Room message ${index}`,
      at: new Date().toISOString(),
    })),
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (command: string) => {
          (window as Window & { copiedCommand?: string }).copiedCommand =
            command;
        },
      },
    });
  });
  await page.goto("/referee-panel");
  const stages = page.getByRole("navigation", { name: "Referee stages" });
  const preparation = page.locator("#referee-preparation");
  const irc = page.getByRole("complementary", { name: "IRC console" });
  const send = irc.getByRole("button", { name: "Send to local IRC" });
  const log = irc.getByRole("log");
  await expect(
    irc.getByRole("heading", { name: "IRC", exact: true }),
  ).toBeInViewport();
  await expect(log).toBeInViewport();
  await expect(log.getByText("All players are ready")).toBeInViewport();
  expect(await log.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(send).toBeInViewport();

  for (const [label, command] of [
    ["Create room", "!mp make OCLR S11: Synthetic"],
    ["Room rules", "!mp set 2 3 8"],
    ["Add Streamer to room", "!mp addref Synthetic_Streamer"],
  ]) {
    const copy = preparation.getByRole("button", { name: `Copy ${label}` });
    await copy.click();
    await expect(copy).toHaveAttribute("data-copied", "true");
    expect(
      await page.evaluate(
        () => (window as Window & { copiedCommand?: string }).copiedCommand,
      ),
    ).toBe(command);
  }
  await expect(irc.getByLabel("IRC command")).toHaveValue("");
  await stages.getByRole("link", { name: "BP stage" }).click();
  await expect(page.locator("#referee-bp-title")).toBeInViewport();
  const maps = (await pool(page).boundingBox())!;
  const outcomes = (await page
    .getByRole("region", {
      name: "Record and correct outcomes",
    })
    .boundingBox())!;
  const consoleBox = (await irc.boundingBox())!;
  if (isMobile) {
    expect(outcomes.y).toBeGreaterThanOrEqual(maps.y + maps.height);
    expect(
      Math.abs(consoleBox.y + consoleBox.height - page.viewportSize()!.height),
    ).toBeLessThan(2);
  } else {
    expect(Math.abs(maps.y - outcomes.y)).toBeLessThan(2);
    expect(maps.x + maps.width).toBeLessThan(outcomes.x);
    expect(outcomes.x + outcomes.width).toBeLessThan(consoleBox.x);
  }
  await stages.getByRole("link", { name: "Post-match calculation" }).click();
  await expect(log).toBeInViewport();
  await expect(send).toBeInViewport();
});

test("withdraw stays outside collapsed details and score floats only within BP", async ({
  page,
}, info) => {
  const state = await setup(page, { connected: true });
  await page.goto("/referee-panel");
  const summary = records(page),
    undo = summary.getByRole("button", {
      name: "Withdraw last Ban / Pick",
      exact: true,
    });
  await expect(undo).toBeVisible();
  expect(await undo.evaluate((el) => !!el.closest("details:not([open])"))).toBe(
    false,
  );
  await recordPoolMap(page, "NM1", "Red team BAN");
  await expect(undo).toBeEnabled();
  await expect.poll(() => state.autos.length).toBe(1);
  await page.evaluate(() =>
    document.getElementById("referee-pool")!.scrollIntoView(),
  );
  expect(await summary.evaluate((el) => getComputedStyle(el).position)).toBe(
    "sticky",
  );
  const box = await summary.boundingBox();
  const nav = (await page
    .getByRole("navigation", { name: "Referee stages" })
    .boundingBox())!;
  expect(box!.y).toBeGreaterThanOrEqual(nav.y + nav.height);
  expect(box!.y).toBeLessThanOrEqual(nav.y + nav.height + 24);
  await summary.screenshot({ path: info.outputPath("scoreboard.png") });
  await undo.click();
  await expect
    .poll(() => state.current().projection.activeSelections.length)
    .toBe(0);
  await expect.poll(() => state.autos.length).toBe(2);
  await expect(undo).toBeDisabled();
  await page.evaluate(() => {
    const post = document.getElementById("referee-post-match")!;
    post.style.minHeight = "1200px";
    post.scrollIntoView();
  });
  const post = await page.locator("#referee-post-match").boundingBox();
  const released = await summary.boundingBox();
  expect(released!.y + released!.height).toBeLessThanOrEqual(post!.y);
});

test("retrying an accepted automatic sync uses the same event and never duplicates BP or its announcement", async ({
  page,
}) => {
  const state = await setup(page, { connected: true, failure: "syncLost" });
  await page.goto("/referee-panel");
  await recordPoolMap(page, "NM1", "Red team BAN");
  await page
    .getByRole("button", { name: "Retry IRC sync", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry IRC sync", exact: true }),
  ).toHaveCount(0);
  expect(state.autos).toHaveLength(1);
  expect(state.commands).toHaveLength(1);
  expect(state.current().projection.activeSelections).toHaveLength(1);
});

test("bound MP sync updates the red-left scoreboard, fences stale IRC reads and opens manual review", async ({
  page,
}) => {
  const state = await setup(page, { roomId: 880001 });
  const redName = "Red Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const blueName = "Blue Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  state.current().teams[0].name = redName;
  state.current().teams[1].name = blueName;
  let binding: null | {
    matchId: number;
    revision: number;
    enabled: boolean;
    nextPollAt: string;
    lastCheckedAt: null;
    error: null;
    issues: { gameId: number; beatmapId: number; reason: string }[];
    issueCount: number;
    syncing: boolean;
  } = null;
  let synced: ReturnType<typeof workspace> | null = null,
    syncs = 0,
    ircReads = 0;
  let outcomeSources: RefereeMpView["outcomeSources"] = [];
  page.on("response", (response) => {
    if (response.url().endsWith("/irc")) ircReads++;
  });
  await page.route(`${api}/mp`, async (r) => {
    const c = r.request().postDataJSON();
    if (c.action === "bind_room") {
      expect(c.expectedRoomId).toBe(880001);
      expect(c.match).toBeUndefined();
      binding = {
        matchId: 880001,
        revision: 1,
        enabled: true,
        nextPollAt: new Date(0).toISOString(),
        lastCheckedAt: null,
        error: null,
        issues: [],
        issueCount: 0,
        syncing: false,
      };
    }
    if (c.action === "sync") {
      syncs++;
    }
    if (c.action === "sync" && syncs > 1) {
      const before = state.current(),
        pick = before.projection.activeSelections.find(
          (s) => s.kind !== "ban",
        )!;
      const win = {
        id: id(7000),
        ordinal: before.events.length + 1,
        actorId: 1,
        createdAt: new Date().toISOString(),
        payload: {
          type: "attempt_resolved" as const,
          pickId: pick.id,
          attemptId: pick.attempts[0].id,
          status: "completed" as const,
          winnerTeamId: before.teams[0].id,
        },
      };
      synced = workspace([
        ...before.events,
        win,
        ...(syncs > 2
          ? [
              {
                ...win,
                id: id(7001),
                ordinal: win.ordinal + 1,
                payload: {
                  ...win.payload,
                  status: "aborted" as const,
                  winnerTeamId: null,
                },
              },
            ]
          : []),
      ]);
      synced.teams[0].name = redName;
      synced.teams[1].name = blueName;
      outcomeSources = [
        { eventId: syncs > 2 ? id(7001) : win.id, review: syncs > 2 },
      ];
      if (syncs > 2) {
        binding!.issues = [
          { gameId: 880001, beatmapId: pick.beatmapId, reason: "replay" },
        ];
        binding!.issueCount = 1;
      }
    }
    await r.fulfill({
      json: { binding, workspace: synced ?? state.current(), outcomeSources },
    });
  });
  await page.goto("/referee-panel?longnames");
  await recordPoolMap(page, "NM1", "Red team BAN");
  await recordPoolMap(page, "NM2", "Red team PICK");
  await records(page)
    .getByRole("button", { name: "Automatic sync", exact: true })
    .click();
  const recordEditor = page.getByRole("region", {
    name: "Record and correct outcomes",
  });
  const row = recordEditor.getByRole("button", { name: /PICK NM2/ });
  await expect(row).toContainText("Awaiting MP");
  await expect.poll(() => syncs).toBeGreaterThan(1);
  await expect(records(page).locator('div[data-team="red"] > span')).toHaveText(
    redName,
  );
  await expect(
    records(page).locator('div[data-team="blue"] > span'),
  ).toHaveText(blueName);
  await expect(records(page).locator("strong")).toHaveText(["1", "0"]);
  await expect(
    recordEditor.getByText("Ban / Pick team", { exact: true }),
  ).toBeVisible();
  const winnerLabel = row.getByText("Winner", { exact: true });
  await expect(winnerLabel).toBeVisible();
  const winner = winnerLabel.locator("..").getByText(redName, { exact: true });
  await expect(winner).toBeVisible();
  expect(
    await winner.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await row.click();
  await expect(
    recordEditor.getByText("Scored by MP", { exact: true }),
  ).toBeVisible();
  await row.click();
  const count = ircReads;
  await expect.poll(() => ircReads).toBeGreaterThan(count);
  if (syncs < 3)
    await expect(records(page).locator("strong")).toHaveText(["1", "0"]);
  await expect(
    page.getByText("Replay or repeated beatmap", { exact: true }),
  ).toBeHidden();
  await page
    .getByText("Manual review required: 1", { exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Replay or repeated beatmap", { exact: false }),
  ).toBeVisible();
  await expect(records(page).locator("strong")).toHaveText(["0", "0"]);
  await page
    .getByRole("link", { name: "Review referee records", exact: true })
    .click();
  await expect(row).toContainText("Manual review");
  const win = recordEditor.getByRole("button", {
    name: "Record win: Red team",
    exact: true,
  });
  await expect(win).toBeHidden();
  await row.click();
  await expect(win).toBeVisible();
});
