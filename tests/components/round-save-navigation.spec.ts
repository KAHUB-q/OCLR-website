import { expect, test } from "@playwright/test";

for (const nextStage of ["group", "knockout"] as const) {
  test(`an earlier round save cannot close a new ${nextStage} round draft`, async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    const writes: Record<string, unknown>[] = [];
    await page.route(
      "**/api/admin/tournaments/synthetic/mappools",
      async (route) => {
        writes.push(route.request().postDataJSON());
        if (writes.length === 1) await held;
        await route.fulfill({ json: { saved: true } });
        finished = true;
      },
    );
    await page.goto("/round-referee-policy?other-season");
    const original = page.getByRole("region", {
      name: "Edit selected round",
      exact: true,
    });
    await original
      .getByLabel("Round name", { exact: true })
      .fill("Synthetic saved round");
    await original
      .getByRole("button", { name: "Save round", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(1);
    if (nextStage === "knockout")
      await page
        .getByRole("tab", { name: "Knockout Stage", exact: true })
        .click();
    await page
      .getByRole("button", { name: "+ New round", exact: true })
      .click();
    const current = page.getByRole("region", {
      name: "Create a round",
      exact: true,
    });
    await current
      .getByLabel("Round name", { exact: true })
      .fill("Synthetic unsaved draft");
    await current.getByLabel("Round order", { exact: true }).fill("3");
    release();
    await expect.poll(() => finished).toBe(true);
    // Wait for the old mutation's refresh, not just its network response.
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.roundRefreshes),
      )
      .toBe("1");
    await expect(current).toBeVisible();
    await expect(current.getByLabel("Round name", { exact: true })).toHaveValue(
      "Synthetic unsaved draft",
    );
    await current
      .getByRole("button", { name: "Create round", exact: true })
      .click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toMatchObject({
      action: "round_create",
      stage: nextStage,
      name: "Synthetic unsaved draft",
      position: 3,
    });
    await expect(current).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Round saved.");
  });
}

test("the current round keeps its failed draft and closes after a successful retry", async ({
  page,
}) => {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill(
        writes.length === 1
          ? {
              status: 400,
              json: { error: "The action could not be completed." },
            }
          : { json: { saved: true } },
      );
    },
  );
  await page.goto("/round-referee-policy?other-season");
  const current = page.getByRole("region", {
    name: "Edit selected round",
    exact: true,
  });
  const name = current.getByLabel("Round name", { exact: true });
  const save = current.getByRole("button", { name: "Save round", exact: true });
  await name.fill("Synthetic retry draft");
  await save.click();
  await expect(current.getByRole("alert")).toHaveText(
    "The action could not be completed.",
  );
  await expect(name).toHaveValue("Synthetic retry draft");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(current).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Round saved.");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({
    action: "round_edit",
    name: "Synthetic retry draft",
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("synthetic-refresh", () => {
      document.documentElement.dataset.roundRefreshes = String(
        Number(document.documentElement.dataset.roundRefreshes ?? 0) + 1,
      );
    });
  });
});
