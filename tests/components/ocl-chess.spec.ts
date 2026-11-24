import { test, expect } from "@playwright/test";
test("selects without writing and confirms a saved pixel", async ({ page }) => {
  let writes = 0;
  const state = {
    pixels: "0".repeat(16384),
    revision: 0,
    enabled: true,
    nextAt: 0,
    serverTime: Date.now(),
    signedIn: true,
    admin: false,
  };
  await page.route("**/api/games/ocl-chess", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      state.revision++;
      state.nextAt = Date.now() + 30000;
    }
    await route.fulfill({ json: state });
  });
  await page.goto("/ocl-chess");
  await expect(
    page.getByRole("button", { name: "Confirm pixel" }),
  ).toBeEnabled();
  const viewport = await page.locator(".chess-viewport").boundingBox();
  const screen = page.viewportSize()!;
  expect(viewport!.width).toBeGreaterThan(screen.width * 0.9);
  expect(viewport!.height).toBeGreaterThan(screen.height * 0.5);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(screen.width);
  await page
    .getByLabel("Shared pixel canvas")
    .click({ position: { x: 25, y: 25 } });
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Confirm pixel" }).click();
  await expect.poll(() => writes).toBe(1);
  await page.screenshot({
    path: `/tmp/oclr-379-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Confirm pixel" }),
  ).toBeDisabled();
});
test("unlocks selection after a cooldown rejection and submits a new pixel", async ({
  page,
}) => {
  await page.clock.install();
  const commands: { requestId: string; x: number; y: number; color: number }[] =
    [];
  let nextAt = 0;
  await page.route("**/api/games/ocl-chess", async (route) => {
    if (route.request().method() === "POST") {
      commands.push(route.request().postDataJSON());
      if (commands.length === 1) {
        nextAt = await page.evaluate(() => Date.now() + 30_000);
        await route.fulfill({
          status: 429,
          json: {
            error: "Wait for the cooldown before placing another pixel.",
          },
        });
        return;
      }
    }
    await route.fulfill({
      json: {
        pixels: "0".repeat(16384),
        revision: 0,
        enabled: true,
        nextAt,
        serverTime: await page.evaluate(() => Date.now()),
        signedIn: true,
        admin: false,
      },
    });
  });
  await page.goto("/ocl-chess");
  const confirm = page.getByRole("button", { name: "Confirm pixel" });
  await page.getByLabel("X", { exact: true }).fill("10");
  await confirm.click();
  await expect(page.locator('p[role="status"]')).toHaveText(
    "Wait for the cooldown before placing another pixel.",
  );
  await expect(page.getByLabel("X", { exact: true })).toBeEnabled();
  await expect(page.locator(".chess-palette button:disabled")).toHaveCount(0);
  await page.getByLabel("X", { exact: true }).fill("11");
  await page.locator(".chess-palette button").first().click();
  await page.clock.runFor(3_100);
  await expect(confirm).toBeDisabled();
  await page.clock.runFor(30_000);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toMatchObject({ x: 11, y: 0, color: 0 });
  expect(commands[1].requestId).not.toBe(commands[0].requestId);
});

test("retries an uncertain save with the same request identity", async ({
  page,
}) => {
  const commands: unknown[] = [];
  await page.route("**/api/games/ocl-chess", async (route) => {
    if (route.request().method() === "POST") {
      commands.push(route.request().postDataJSON());
      await route.abort();
      return;
    }
    await route.fulfill({
      json: {
        pixels: "0".repeat(16384),
        revision: 0,
        enabled: true,
        nextAt: 0,
        serverTime: Date.now(),
        signedIn: true,
        admin: false,
      },
    });
  });
  await page.goto("/ocl-chess");
  await page.getByRole("button", { name: "Confirm pixel" }).click();
  await page.getByRole("button", { name: "Retry pixel" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0]).toEqual(commands[1]);
});

for (const saved of [true, false]) {
  test(`confirms an uncertain pixel after pause (${saved ? "saved" : "not saved"})`, async ({
    page,
  }) => {
    const commands: unknown[] = [];
    let paused = false;
    const snapshot = () => ({
      pixels: "0".repeat(16384),
      revision: paused ? 1 : 0,
      enabled: !paused,
      nextAt: saved && paused ? Date.now() + 30000 : 0,
      serverTime: Date.now(),
      signedIn: true,
      admin: false,
    });
    await page.route("**/api/games/ocl-chess", async (route) => {
      if (route.request().method() === "POST") {
        commands.push(route.request().postDataJSON());
        if (commands.length === 1) {
          paused = true;
          await route.abort();
          return;
        }
        await route.fulfill(
          saved
            ? { json: snapshot() }
            : { status: 403, json: { error: "The canvas is paused." } },
        );
        return;
      }
      await route.fulfill({ json: snapshot() });
    });
    await page.goto("/ocl-chess");
    await page.getByRole("button", { name: "Confirm pixel" }).click();
    await expect(
      page.getByText("Canvas paused", { exact: true }),
    ).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry pixel" });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect.poll(() => commands.length).toBe(2);
    expect(commands[1]).toEqual(commands[0]);
    await expect(
      page.getByRole("button", { name: "Confirm pixel" }),
    ).toBeDisabled();
    await expect(page.locator(".chess-palette button").first()).toBeEnabled();
    await expect(page.getByLabel("X", { exact: true })).toBeEnabled();
    if (!saved)
      await expect(page.locator('p[role="status"]')).toHaveText(
        "The canvas is paused.",
      );
  });
}

test.describe("canvas touch gestures", () => {
  test.use({ hasTouch: true });

  test("adding a second finger cannot select a cell while exploring", async ({
    page,
  }) => {
    const writes: string[] = [];
    await page.route("**/api/games/ocl-chess", (route) => {
      if (route.request().method() !== "GET")
        writes.push(route.request().method());
      return route.fulfill({
        json: {
          pixels: "0".repeat(16384),
          revision: 0,
          enabled: true,
          signedIn: true,
          serverTime: Date.now(),
          nextAt: 0,
          admin: false,
        },
      });
    });
    await page.goto("/ocl-chess");
    await expect(
      page.getByRole("button", { name: "Confirm pixel" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const viewport = page.locator(".chess-viewport");
    await viewport.scrollIntoViewIfNeeded();
    const box = (await viewport.boundingBox())!;
    const start = { x: box.x + 180, y: box.y + 100, id: 1 };
    const moved = { ...start, x: start.x - 50 };
    const other = { x: box.x + 60, y: box.y + 50, id: 2 };
    const touch = await page.context().newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      touchPoints: (typeof start)[],
    ) => touch.send("Input.dispatchTouchEvent", { type, touchPoints });
    const x = page.getByLabel("X", { exact: true });
    const y = page.getByLabel("Y", { exact: true });
    const scrollLeft = () => viewport.evaluate((el) => el.scrollLeft);

    await send("touchStart", [start]);
    await send("touchMove", [moved]);
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    const firstPan = await scrollLeft();
    await send("touchStart", [moved, other]);
    await send("touchMove", [{ ...moved, x: moved.x - 20 }, other]);
    await expect.poll(scrollLeft).toBeGreaterThan(firstPan);
    await send("touchEnd", []);
    await expect(x).toHaveValue("0");
    await expect(y).toHaveValue("0");

    await send("touchStart", [start]);
    await send("touchStart", [start, other]);
    await send("touchEnd", []);
    await expect(x).toHaveValue("0");
    await expect(y).toHaveValue("0");

    await page.touchscreen.tap(other.x, other.y);
    await expect(x).not.toHaveValue("0");
    await expect(y).not.toHaveValue("0");
    expect(writes).toEqual([]);
    await touch.detach();
  });
});
