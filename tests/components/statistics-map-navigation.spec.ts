import { expect, test } from "@playwright/test";

for (const view of [
  "Performance scores",
  "Individual leaderboard",
  "Team leaderboard",
  "Team placements",
  "Solo placements",
]) {
  test(`unplayed map does not leave a hidden filter in ${view}`, async ({
    page,
  }) => {
    await page.goto("/event-statistics?unplayed");
    await page
      .getByRole("button", { name: "Mappool statistics", exact: true })
      .click();
    const map = page.getByRole("combobox", { name: "Map", exact: true });
    await map.selectOption(JSON.stringify(["Final", "HD1", 1002]));
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("Unplayed map");
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(map).toHaveValue("");
    await expect(page.locator("tbody tr")).toHaveCount(
      view === "Individual leaderboard" || view === "Team leaderboard" ? 3 : 2,
    );
  });
}

test("played map and team filters survive statistics view changes", async ({
  page,
}) => {
  await page.goto("/event-statistics?unplayed");
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  const map = page.getByRole("combobox", { name: "Map", exact: true });
  const key = JSON.stringify(["Final", "NM1", 1001]);
  await map.selectOption(key);
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("Y");
  await page
    .getByRole("button", { name: "Individual leaderboard", exact: true })
    .click();
  await expect(map).toHaveValue(key);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody a[href='/players/22?edition=synthetic']"),
  ).toBeVisible();
});
