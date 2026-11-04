import { test, expect } from "@playwright/test";
test("reopening never transfers a selection to a replaced source map or submits while reloading", async ({
  page,
}) => {
  let revision = 0;
  let release: (() => void) | undefined;
  const writes: Record<string, unknown>[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools/history",
    async (route) => {
      if (revision)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await route.fulfill({
        json: [
          {
            editionSlug: "synthetic-history",
            editionName: "Synthetic history",
            poolId: "history-pool",
            poolName: "Synthetic pool",
            fingerprint: revision ? "b".repeat(64) : "a".repeat(64),
            maps: [
              {
                key: "NM1",
                slot: "NM1",
                category: "NM",
                beatmapId: revision ? 444 : 111,
                title: revision ? "Replacement" : "Original",
              },
            ],
          },
        ],
      });
    },
  );
  await page.route(
    "**/api/admin/tournaments/synthetic/mappools",
    async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/exhibition-pool-import");
  const summary = page.locator("summary");
  await summary.click();
  await page.getByRole("checkbox").check();
  await summary.click();
  revision = 1;
  await summary.click();
  await expect(
    page.getByRole("button", { name: "Add selected maps", exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  const replacement = page.getByRole("checkbox", { name: /Replacement/ });
  await expect(replacement).not.toBeChecked();
  const add = page.getByRole("button", {
    name: "Add selected maps",
    exact: true,
  });
  await expect(add).toBeDisabled();
  expect(writes).toHaveLength(0);
  await replacement.check();
  await add.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    sourceKeys: ["NM1"],
    sourceFingerprint: "b".repeat(64),
  });
});
