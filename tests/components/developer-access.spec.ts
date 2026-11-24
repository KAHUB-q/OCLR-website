import { test, expect } from "@playwright/test";

// Port parsing/authorization live in unit/integration tests. This exercises the
// actual editor's add/remove, Enter handling, pending state and submitted list.
test("edits and submits multiple ports without losing an unfinished entry", async ({
  page,
}) => {
  const submitted: unknown[] = [];
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/developer/tokens", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { tokens: [] } });
    submitted.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({
      status: 400,
      json: { error: "This local origin is not allowed." },
    });
  });
  await page.goto("/developer-access");
  const input = page.getByRole("textbox", {
    name: "Add local port",
    exact: true,
  });
  const create = page.getByRole("button", {
    name: "Create token",
    exact: true,
  });
  await input.fill("5173");
  await expect(create).toBeDisabled();
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove port 5173", exact: true }),
  ).toBeVisible();
  expect(submitted).toHaveLength(0);
  await input.fill("5173");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "This port is already in the list.",
  );
  await input.fill("4000");
  await page.getByRole("button", { name: "Add port", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove port 3000", exact: true })
    .click();
  await create.click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({ ports: [5173, 4000] });
  await expect(input).toBeDisabled();
  finish();
  await expect(page.getByRole("alert")).toHaveText(
    "This local origin is not allowed.",
  );
  await expect(input).toBeEnabled();
  await page
    .getByRole("button", { name: "Remove port 5173", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove port 4000", exact: true })
    .click();
  await expect(create).toBeDisabled();
});

test("shows the configured server ceiling and disabled state", async ({
  page,
}) => {
  await page.goto("/developer-access?restricted");
  await page
    .getByRole("textbox", { name: "Add local port", exact: true })
    .fill("4000");
  await page.getByRole("button", { name: "Add port", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "This port is not allowed by the server.",
  );
  await page.goto("/developer-access?disabled");
  await expect(
    page.getByRole("button", { name: "Create token", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Add local port", exact: true }),
  ).toBeDisabled();
});

const start = new Date("2026-11-25T12:59:50Z");
const access = {
  id: "00000000-0000-4000-8000-000000000001",
  origin: "http://localhost:3000",
  ports: [3000],
  scopes: ["identity:read"],
  createdAt: "2026-11-25T12:00:00Z",
  expiresAt: "2026-11-25T13:00:00Z",
  revokedAt: null,
};

test("fixed expiry advances and a foreground refresh reconciles external revocation and permission changes", async ({
  page,
}) => {
  await page.clock.install({ time: start });
  let status = 200;
  let revokedAt: string | null = null;
  await page.route("**/api/developer/tokens", (route) =>
    route.fulfill({ status, json: { tokens: [{ ...access, revokedAt }] } }),
  );
  await page.goto("/developer-access");
  const revoke = page.getByRole("button", { name: "Revoke token" });
  await expect(revoke).toBeVisible();
  status = 401;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Unconfirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("Expired", { exact: true })).toHaveCount(0);
  status = 200;
  await page.clock.fastForward(11000);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  revokedAt = start.toISOString();
  const foreground = () =>
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await foreground();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  status = 403;
  await foreground();
  await expect(
    page.getByText("Developer access is required.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create token" }),
  ).toBeDisabled();
  status = 200;
  await foreground();
  await expect(
    page.getByRole("button", { name: "Create token" }),
  ).toBeEnabled();
});

test("streaming confirms successive lease deadlines, retries after failure and handles loss of the managing session", async ({
  page,
}) => {
  await page.clock.install({ time: start });
  let expiresAt = access.expiresAt;
  let status = 200;
  await page.route("**/api/streaming/tokens?edition=test-cup", (route) =>
    route.fulfill({
      status,
      json: {
        tokens: [
          {
            ...access,
            editionSlug: "test-cup",
            scopes: ["streaming:read"],
            lastUsedAt: start.toISOString(),
            expiresAt,
          },
        ],
      },
    }),
  );
  await page.goto("/developer-access?streaming");
  const expiry = page.locator("time");
  await expect(expiry).toHaveAttribute("datetime", expiresAt);
  for (const next of ["2026-11-25T13:00:15Z", "2026-11-25T13:00:30Z"]) {
    const previous = expiresAt;
    expiresAt = next;
    await page.clock.runFor(
      Date.parse(previous) - (await page.evaluate(() => Date.now())) + 100,
    );
    await expect(expiry).toHaveAttribute("datetime", next);
    await expect(
      page.getByRole("button", { name: "Revoke token" }),
    ).toBeVisible();
  }
  status = 503;
  await page.clock.fastForward(16000);
  await expect(page.getByText("Unconfirmed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Could not refresh token status/)).toBeVisible();
  status = 200;
  await page.clock.fastForward(30000);
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  status = 401;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Sign in with osu! to continue.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create token" }),
  ).toBeDisabled();
});

test("late metadata cannot undo mutations or restore a hidden one-time secret", async ({
  page,
}) => {
  let entries: (Omit<typeof access, "revokedAt"> & {
    revokedAt: string | null;
  })[] = [];
  const current = { ...access, expiresAt: "2026-11-25T14:00:00Z" };
  await page.clock.install({ time: start });
  let hold = true;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/developer/tokens", async (route) => {
    if (route.request().method() === "POST") {
      entries = [current];
      return route.fulfill({
        status: 201,
        json: { access: current, token: "synthetic-one-time-value" },
      });
    }
    const snapshot = [...entries];
    if (hold) {
      hold = false;
      await gate;
    }
    return route.fulfill({ json: { tokens: snapshot } });
  });
  await page.route("**/api/developer/tokens/*", (route) => {
    entries = [{ ...current, revokedAt: start.toISOString() }];
    return route.fulfill({ json: entries[0] });
  });
  await page.goto("/developer-access");
  await expect.poll(() => hold).toBe(false);
  await page.getByRole("button", { name: "Create token" }).click();
  const secret = page.getByRole("textbox", { name: "New API token" });
  await expect(secret).toBeVisible();
  await page.getByRole("button", { name: "Hide token" }).click();
  release();
  await page.getByRole("button", { name: "Revoke token" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(secret).toHaveCount(0);
});
