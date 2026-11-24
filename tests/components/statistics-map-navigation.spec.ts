import { expect, test } from "@playwright/test";

for (const view of ["Performance scores", "Mappool statistics"]) {
  test(`round changes keep only compatible maps in ${view}`, async ({
    page,
  }) => {
    await page.goto("/event-statistics?rounds&unplayed");
    await page.getByRole("button", { name: view, exact: true }).click();
    const round = page.getByRole("combobox", { name: "Rounds", exact: true });
    const map = page.getByRole("combobox", { name: "Map", exact: true });
    const finalMap = JSON.stringify(["Final", "NM1", 1001]);
    await map.selectOption(finalMap);
    await round.selectOption("Final");
    await expect(map).toHaveValue(finalMap);
    await round.selectOption("");
    await expect(map).toHaveValue(finalMap);

    await round.selectOption("Semifinal");
    await expect(map).toHaveValue("");
    await expect(map.locator("option")).toHaveText([
      "All",
      "Semifinal · NM1 · 2002",
    ]);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("Same");

    await round.selectOption("Final");
    const unplayed = map.getByRole("option", { name: "Final · HD1 · 1002" });
    await expect(unplayed).toHaveCount(view === "Mappool statistics" ? 1 : 0);
  });
}

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
