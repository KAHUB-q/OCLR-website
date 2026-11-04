import { test, expect } from "@playwright/test";
test("select-all merges filtered maps, deduplicates and preserves the selection at the limit", async ({
  page,
}) => {
  const maps = Array.from({ length: 51 }, (_, index) => ({
    key: `NM${index + 1}`,
    slot: `NM${index + 1}`,
    category: "NM",
    beatmapId: index + 1,
    title: index === 0 ? "Original" : "Other",
  }));
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools/history",
    (route) =>
      route.fulfill({
        json: [
          {
            editionSlug: "synthetic-history",
            editionName: "History",
            poolId: "history-pool",
            poolName: "Pool",
            fingerprint: "a".repeat(64),
            maps,
          },
        ],
      }),
  );
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/exhibition-pool-import");
  await page.locator("summary").click();
  await page.getByRole("checkbox").first().check();
  const search = page.getByRole("searchbox");
  await search.fill("Other");
  const all = page.getByRole("button", { name: "Select all visible maps" });
  await all.click();
  await expect(page.getByRole("alert")).toHaveText("Choose up to 50 maps.");
  await search.fill("");
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).not.toBeChecked();
  await search.fill("NM2 2");
  await all.click();
  await all.click();
  await search.fill("");
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add selected maps", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].sourceKeys).toEqual(["NM1", "NM2"]);
});
