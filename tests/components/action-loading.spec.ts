import { expect, test, type Page } from "@playwright/test";

type Kind =
  | "text"
  | "direct"
  | "icon"
  | "switch"
  | "async"
  | "settings"
  | "round"
  | "team"
  | "referee";
function triggerFor(page: Page, kind: Kind) {
  if (kind === "settings")
    return page.locator(".general-settings .settings-save > button");
  if (kind === "round")
    return page.getByRole("button", { name: "Delete round", exact: true });
  if (kind === "switch")
    return page.getByRole("switch", { name: "Publish pool", exact: true });
  return page.locator("[data-action-row] > button").first();
}
function submitFor(page: Page, kind: Kind) {
  return page.getByRole("dialog").getByRole("button", {
    name:
      kind === "team"
        ? "Save team"
        : kind === "referee"
          ? "Save assignments"
          : "Confirm",
    exact: true,
  });
}

for (const theme of ["light", "dark"]) {
  for (const kind of [
    "text",
    "direct",
    "icon",
    "switch",
    "async",
    "settings",
    "round",
    "team",
    "referee",
  ] as const) {
    test(`${kind} keeps its request and refresh indicator local (${theme})`, async ({
      page,
      isMobile,
    }, info) => {
      if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
      let release!: () => void, releasePostSave!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const postSave = new Promise<void>((resolve) => {
        releasePostSave = resolve;
      });
      const writes: {
        method: string;
        json?: Record<string, unknown>;
        body: string | null;
      }[] = [];
      let postSaveStarted = false;
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        writes.push({
          method: request.method(),
          body: request.postData(),
          json: request.headers()["content-type"]?.includes("application/json")
            ? request.postDataJSON()
            : undefined,
        });
        await gate;
        await route.fulfill({ json: {} });
      });
      await page.route("**/synthetic-post-save", async (route) => {
        postSaveStarted = true;
        await postSave;
        await route.fulfill({ json: {} });
      });
      await page.goto(`/action-loading?kind=${kind}&theme=${theme}`);
      if (kind === "settings")
        await page
          .getByRole("textbox", { name: "Tournament name", exact: true })
          .fill("Synthetic changed edition");
      const trigger = triggerFor(page, kind);
      const name =
        (await trigger.getAttribute("aria-label")) ??
        (kind === "switch" ? "Publish pool" : await trigger.innerText());
      await trigger.click();
      const confirmed = !["direct", "async", "settings"].includes(kind);
      if (confirmed) {
        if (kind === "referee")
          await page.getByRole("dialog").getByRole("checkbox").first().check();
        await submitFor(page, kind).click();
        const dialog = page.getByRole("dialog");
        await expect(
          dialog.locator("[data-loading-region-overlay]"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
      }
      await expect.poll(() => writes.length).toBe(1);
      await expect(trigger).toBeDisabled();
      await expect(trigger).toHaveAttribute("aria-busy", "true");
      await trigger.evaluate((element) => (element as HTMLElement).click());
      expect(writes).toHaveLength(1);
      release();
      if (kind === "async") {
        await expect.poll(() => postSaveStarted).toBe(true);
        await expect(trigger).toBeDisabled();
        await expect(trigger.locator("[data-spinner]")).toBeVisible();
        await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(
          0,
        );
        releasePostSave();
      }
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
      await expect(trigger).toHaveAttribute("aria-busy", "true");
      await expect(trigger).toBeDisabled();
      const content =
        kind === "switch"
          ? trigger.locator("xpath=ancestor::label[1]")
          : trigger;
      const spinner = content.locator("[data-spinner]");
      await expect(spinner).toBeVisible();
      await expect(spinner).toHaveCSS("opacity", "1");
      await expect(trigger).toHaveAccessibleName(name);
      await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(
        0,
      );
      await expect(page.locator("[data-action-row] [inert]")).toHaveCount(0);
      const sibling = page.locator("[data-sibling]");
      if (await sibling.count()) {
        await sibling.click();
        await expect(page.locator("output")).toHaveText("1");
      }
      const size = await spinner.evaluate((element) => ({
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
      }));
      expect(size.width).toBeLessThanOrEqual(24);
      expect(size.height).toBeLessThanOrEqual(24);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (["settings", "switch", "referee", "team"].includes(kind))
        await page
          .locator("main")
          .screenshot({ path: info.outputPath(`${kind}-${theme}.png`) });
      if (kind === "team") {
        expect(writes[0].method).toBe("PATCH");
        expect(writes[0].body).toContain('name="expectedVersion"');
      } else if (kind === "referee") {
        expect(writes[0]).toMatchObject({
          method: "PATCH",
          json: { expectedAssignmentRevision: 3, refereeIds: [12345] },
        });
      } else if (kind === "round") {
        expect(writes[0].json).toMatchObject({
          action: "round_delete",
          expectedVersion: 4,
          confirmed: true,
        });
      } else if (kind === "settings") {
        expect(writes[0].json).toMatchObject({
          action: "general",
          expectedRevision: 4,
        });
      }
      await page.evaluate(() =>
        window.dispatchEvent(new Event("finish-refresh")),
      );
      await expect(trigger).toHaveAttribute("aria-busy", "false");
      await expect(trigger).toBeEnabled();
      await expect(spinner).toHaveCount(0);
      expect(writes).toHaveLength(1);
    });
  }
}

for (const kind of ["direct", "switch", "team", "referee"] as const) {
  test(`${kind} releases feedback after a conflict and retries`, async ({
    page,
  }) => {
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      writes++;
      await route.fulfill(
        writes === 1
          ? {
              status: 409,
              json: { error: "The action could not be completed." },
            }
          : { json: {} },
      );
    });
    await page.goto(`/action-loading?kind=${kind}`);
    const trigger = triggerFor(page, kind);
    await trigger.click();
    if (kind !== "direct") await submitFor(page, kind).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    const retry = kind === "direct" ? trigger : submitFor(page, kind);
    await expect(retry).toBeEnabled();
    await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
    await retry.click();
    await expect(page.locator("html")).toHaveAttribute("data-refreshes", "2");
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(trigger).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(writes).toBe(2);
  });
}

test("explicit form regions retain their operation lock", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    await gate;
    await route.fulfill({ json: {} });
  });
  await page.goto("/action-loading?kind=region");
  await page.locator("[data-action-row] > button").first().click();
  await expect(page.locator("[data-loading-region-overlay]")).toBeVisible();
  await expect(page.locator("[data-sibling]")).toHaveAttribute("inert", "");
  release();
  await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
  await page.evaluate(() => window.dispatchEvent(new Event("finish-refresh")));
  await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
  await expect(page.locator("[data-sibling]")).not.toHaveAttribute("inert", "");
});

test("read-only confirmation triggers stay disabled", async ({ page }) => {
  await page.goto("/action-loading?kind=direct&readonly");
  await expect(triggerFor(page, "direct")).toBeDisabled();
  await expect(page.locator("[data-spinner]")).toHaveCount(0);
});

for (const operation of [
  "pool-switch",
  "map-remove",
  "batch-move",
  "batch-refresh",
  "batch-remove",
] as const) {
  test(`actual ${operation} stays local through the refresh`, async ({
    page,
    isMobile,
  }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: Record<string, unknown>[] = [];
    await page.route("**/api/**", async (route) => {
      writes.push(route.request().postDataJSON());
      await gate;
      await route.fulfill({ json: {} });
    });
    const batch = operation.startsWith("batch-");
    await page.goto(
      `/action-loading?kind=${batch ? "batch" : "mappool"}&theme=dark`,
    );
    if (batch)
      await page
        .getByRole("checkbox", { name: "Select NM1", exact: true })
        .check();
    const name =
      operation === "pool-switch"
        ? "Publish pool"
        : operation === "map-remove"
          ? "Remove NM1"
          : operation === "batch-move"
            ? "Move / renumber selected"
            : operation === "batch-refresh"
              ? "Refresh selected metadata"
              : "Remove selected maps";
    const trigger = page.getByRole(
      operation === "pool-switch" ? "switch" : "button",
      { name, exact: true },
    );
    await trigger.click();
    if (!["batch-move", "batch-refresh"].includes(operation)) {
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").locator("[data-loading-region-overlay]"),
      ).toBeVisible();
    }
    await expect.poll(() => writes.length).toBe(1);
    release();
    await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute("aria-busy", "true");
    const content =
      operation === "pool-switch"
        ? trigger.locator("xpath=ancestor::label[1]")
        : trigger;
    await expect(content.locator("[data-spinner]")).toBeVisible();
    expect(writes[0]).toMatchObject({ expectedVersion: 7, confirmed: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(trigger).toBeEnabled();
    await expect(content.locator("[data-spinner]")).toHaveCount(0);
  });
}

for (const action of ["publish", "withdraw"] as const) {
  test(`statistics ${action} tracks its post-save reload without masking the workspace`, async ({
    page,
    isMobile,
  }) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0,
      reloads = 0;
    const workspace = {
      slug: "synthetic",
      fixtures: [
        {
          id: "match",
          label: "Synthetic statistics match",
          stage: "Final",
          teams: ["Alpha", "Beta"],
          mpIds: [101],
          score: [1, 0],
        },
      ],
      summaries: [
        {
          fixtureId: "match",
          mpId: 101,
          version: 4,
          stale: false,
          publishedAt: "2026-01-01T00:00:00Z",
        },
      ],
      pools: [],
      reviews: [],
      blockers: [],
      canPublish: true,
    };
    await page.route(
      "**/api/admin/tournaments/synthetic/statistics**",
      async (route) => {
        if (route.request().method() === "POST") {
          writes++;
          expect(route.request().postDataJSON()).toMatchObject({
            action,
            fixtureId: "match",
            expectedVersions: { "101": 4 },
            confirmed: true,
          });
          await route.fulfill({ json: {} });
        } else {
          reloads++;
          if (writes) await gate;
          await route.fulfill({ json: workspace });
        }
      },
    );
    await page.goto("/action-loading?kind=statistics&theme=dark");
    await page
      .getByRole("combobox", { name: "Match", exact: true })
      .selectOption("match");
    const trigger = page.getByRole("button", {
      name:
        action === "publish"
          ? "Approve & publish statistics"
          : "Withdraw statistics",
      exact: true,
    });
    await trigger.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect.poll(() => reloads).toBe(2);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveAttribute("aria-busy", "true");
    await expect(trigger.locator("[data-spinner]")).toBeVisible();
    await expect(
      page.locator("[data-loading-region-overlay]:visible"),
    ).toHaveCount(0);
    await expect(
      page.locator(
        ".statistics-workspace > [data-loading-region-overlay], .statistics-workspace .actions > [data-loading-region-overlay]",
      ),
    ).toHaveCount(0);
    release();
    await expect(page.locator("html")).toHaveAttribute("data-refreshes", "1");
    await expect(trigger.locator("[data-spinner]")).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(trigger).toBeEnabled();
    expect(writes).toBe(1);
  });
}
