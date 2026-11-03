import { test, expect, type Page } from "@playwright/test";
import { bpSyncSource } from "../../src/lib/referee-sync";
import { workspace, id } from "./referee-panel-data";
import { validateRefereeAction } from "../../src/lib/referee-model";
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
  } = {},
) {
  let current = workspace();
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
    r.fulfill({ json: { binding: null, workspace: current } }),
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
          id: id(500),
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
        messages: [],
        commands,
        workspace: current,
      },
    });
  });
  await page.route(api, async (r) => {
    if (r.request().method() !== "PATCH") {
      await r.fulfill({ json: current });
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
function records(page: Page) {
  return page.getByRole("region", { name: "Referee records", exact: true });
}
for (const locale of ["en", "zh-Hans", "zh-Hant"] as const) {
  for (const theme of ["light", "dark"]) {
    test(`BP preview keeps red left and blue right in chronological rows — ${locale} ${theme}`, async ({
      page,
      isMobile,
    }, info) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
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
        "Blue Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      state.current().teams[1].name =
        "Red Team · 超長隊伍名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      await page.goto(
        `/referee-panel?locale=${locale}&theme=${theme}&longnames`,
      );
      await page
        .getByText(text("Preview Ban / Pick sequence"), { exact: true })
        .click();
      const list = page.getByRole("list", {
        name: text("Preview Ban / Pick sequence"),
        exact: true,
      });
      const rows = list.getByRole("listitem");
      await expect(rows).toHaveCount(5);
      await expect(rows.nth(0)).toContainText(/1\s*BAN\s*Blue Team/);
      await expect(rows.nth(1)).toContainText(/2\s*PICK\s*Blue Team/);
      await expect(rows.nth(2)).toContainText(/3\s*BAN\s*Red Team/);
      await expect(rows.nth(3)).toContainText(/4\s*PICK\s*Red Team/);
      await expect(rows.nth(4)).toContainText(/5\s*TB/);
      await expect(rows.nth(4)).toContainText("1:1");
      async function checkColumns(sides: string[]) {
        const bounds = await list.boundingBox();
        const middle = bounds!.x + bounds!.width / 2;
        let bottom = -Infinity;
        for (const [index, side] of sides.entries()) {
          const row = rows.nth(index);
          await expect(row).toHaveAttribute("data-team", side);
          const box = await row.locator(":scope > div").boundingBox();
          expect(box!.y).toBeGreaterThanOrEqual(bottom);
          bottom = box!.y + box!.height;
          if (side === "red") expect(box!.x + box!.width).toBeLessThan(middle);
          else if (side === "blue") expect(box!.x).toBeGreaterThan(middle);
          else
            expect(Math.abs(box!.x + box!.width / 2 - middle)).toBeLessThan(1);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      // Consecutive steps by the same team must each occupy their own row.
      await checkColumns(["blue", "blue", "red", "red", "neutral"]);
      const accessibility = await new AxeBuilder({ page })
        .include("details:has(ol[role='list'])")
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await list.locator("..").screenshot({
        path: info.outputPath(`${locale}-${theme}-preview.png`),
      });
      await page
        .getByLabel(text("First Ban team"), { exact: true })
        .selectOption(id(11));
      await checkColumns(["red", "blue", "blue", "red", "neutral"]);
      await page
        .getByLabel(text("First Ban team"), { exact: true })
        .selectOption("");
      await expect(rows.nth(0)).toHaveAttribute("data-team", "neutral");
      expect(state.writes).toHaveLength(0);
      expect(state.queues).toHaveLength(0);
    });
  }
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
    await route.fulfill({ json: { binding, workspace: state.current() } });
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
  test(`IRC help keeps launch and management buttons side by side — ${locale}`, async ({
    page,
    isMobile,
  }, info) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
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
    for (const theme of ["light", "dark"]) {
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
      expect(left.height).toBeGreaterThanOrEqual(44);
      expect(right.height).toBeGreaterThanOrEqual(44);
      await console
        .getByText(text("Connection setup"), { exact: true })
        .click();
      const help = console.locator("details").filter({
        has: page.getByText(text("Connection setup"), { exact: true }),
      });
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
      await console.screenshot({
        path: info.outputPath(`${locale}-${theme}-irc-help.png`),
      });
    }
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
  await page.goto("/referee-panel?simulation");
  await expect(
    page.getByRole("link", { name: "Manage connections", exact: true }),
  ).toHaveCount(0);
});
test("records Ban and Pick without an IRC connection or queue request", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(page.getByLabel("IRC command", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Send to local IRC", exact: true }),
  ).toBeDisabled();
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(records(page)).toContainText("BAN NM1");
  await expect.poll(() => state.autos.length).toBe(1);
  await expect(
    page.getByText("Queued for local IRC", { exact: true }),
  ).toBeVisible();
  expect(state.queues).toHaveLength(0);
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
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
  const button = pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first();
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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(records(page)).toContainText("BAN NM1");
  await expect(
    page.getByText("[OCLR BP #2] BAN NM1 | Blue | https://osu.ppy.sh/b/10001", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(records(page)).toContainText("BAN NM1");
  await expect(
    pool(page)
      .getByRole("button", { name: "Blue team PICK", exact: true })
      .first(),
  ).toBeEnabled();
  expect(state.writes).toHaveLength(0);
  expect(state.queues).toHaveLength(0);
});
test("read-only users cannot record", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/referee-panel?readonly");
  await expect(
    pool(page)
      .getByRole("button", { name: "Blue team BAN", exact: true })
      .first(),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
  test(`records with localized feedback in ${locale} in both themes`, async ({
    page,
    isMobile,
  }, info) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
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
          ([, v]) => v === source,
        )![0] as keyof typeof en.ui
      ];
    for (const theme of ["light", "dark"]) {
      await setupMp(page);
      await page.goto(`/referee-panel?locale=${locale}&theme=${theme}`);
      const maps = page.getByRole("region", {
        name: text("Round mappool"),
        exact: true,
      });
      await maps
        .getByRole("button", { name: `${text("Blue team")} BAN`, exact: true })
        .first()
        .click();
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
      const score = page.getByRole("region", {
        name: text("Referee records"),
        exact: true,
      });
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
      if (theme === "dark")
        await maps.screenshot({
          path: info.outputPath(`${locale}-recorded.png`),
        });
    }
  });
}

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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await expect(undo).toBeEnabled();
  await expect.poll(() => state.autos.length).toBe(1);
  await page.evaluate(() =>
    document.getElementById("referee-pool")!.scrollIntoView(),
  );
  expect(await summary.evaluate((el) => getComputedStyle(el).position)).toBe(
    "sticky",
  );
  const box = await summary.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(95);
  expect(box!.y).toBeLessThanOrEqual(97);
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
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
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
        ...(syncs > 1
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
      if (syncs > 1) {
        binding!.issues = [
          { gameId: 880001, beatmapId: pick.beatmapId, reason: "replay" },
        ];
        binding!.issueCount = 1;
      }
    }
    await r.fulfill({
      json: { binding, workspace: synced ?? state.current() },
    });
  });
  await page.goto("/referee-panel");
  await pool(page)
    .getByRole("button", { name: "Blue team BAN", exact: true })
    .first()
    .click();
  await pool(page)
    .getByRole("button", { name: "Blue team PICK", exact: true })
    .first()
    .click();
  await records(page)
    .getByRole("button", { name: "Automatic sync", exact: true })
    .click();
  await expect.poll(() => syncs).toBeGreaterThan(0);
  await expect(records(page).locator("strong")).toHaveText(["0", "1"]);
  const count = ircReads;
  await expect.poll(() => ircReads).toBeGreaterThan(count);
  if (syncs < 2)
    await expect(records(page).locator("strong")).toHaveText(["0", "1"]);
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
  await expect(
    page.getByRole("button", { name: "Record win: Blue", exact: true }),
  ).toBeVisible();
});
