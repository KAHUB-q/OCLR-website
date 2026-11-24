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

test("a map filter falls back to a visible sort and lets the user reverse it", async ({
  page,
}) => {
  await page.goto("/event-statistics?two-played-maps");
  await page
    .getByRole("button", { name: "Solo placements", exact: true })
    .click();
  const previous = page.getByRole("columnheader", {
    name: /Final · NM1 · 1001 Score/,
  });
  await previous.getByRole("button").click();
  await previous.getByRole("button").click();
  await expect(previous).toHaveAttribute("aria-sort", "ascending");

  const filter = page.getByRole("combobox", { name: "Map", exact: true });
  const hd = JSON.stringify(["Final", "HD1", 1002]);
  await filter.selectOption(hd);
  const average = page.getByRole("columnheader", { name: /Average score/ });
  const scores = page.locator("tbody tr td:last-child");
  await expect(average).toHaveAttribute("aria-sort", "descending");
  await expect(scores).toHaveText(["900", "100"]);
  await filter.selectOption("");
  await expect(previous).toHaveAttribute("aria-sort", "ascending");

  await filter.selectOption(hd);
  await average.getByRole("button").click();
  await expect(average).toHaveAttribute("aria-sort", "ascending");
  await expect(scores).toHaveText(["100", "900"]);
  await filter.selectOption("");
  await expect(average).toHaveAttribute("aria-sort", "ascending");
});
