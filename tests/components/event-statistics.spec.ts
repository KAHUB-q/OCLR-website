import { expect, test } from "@playwright/test";
test("Series keeps the full ranking when filtering a team or searching by UID", async ({
  page,
}) => {
  await page.goto("/event-statistics");
  await page
    .getByRole("button", { name: "YumuRating Series", exact: true })
    .click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("Y");
  await expect(rows).toHaveCount(1);
  await expect(rows.locator("td").first()).toHaveText("2");
  await expect(rows.getByRole("link")).toHaveAttribute(
    "href",
    "/players/22?edition=synthetic",
  );
  await page.getByRole("textbox", { name: "Search" }).fill("11");
  await expect(page.getByText("No players match these filters.")).toBeVisible();
});
test("all six statistics views preserve identity and same-name team filters", async ({
  page,
}) => {
  await page.goto("/event-statistics");
  const rows = page.locator("tbody tr");
  const player = (id: number) =>
    rows.filter({
      has: page.locator(`a[href='/players/${id}?edition=synthetic']`),
    });
  await expect(rows).toHaveCount(2);
  await expect(player(11)).toContainText("90");
  await expect(player(22)).toContainText("50");
  const mvps = page.getByRole("columnheader", { name: "MVPs", exact: true });
  const mvpColumn = await mvps.evaluate(
    (th: HTMLTableCellElement) => th.cellIndex,
  );
  await expect(player(11).locator("td").nth(mvpColumn)).toHaveText("2");
  await expect(player(22).locator("td").nth(mvpColumn)).toHaveText("0");
  await expect(
    page.getByText("Players with data").locator("..").locator("strong"),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(player(11)).toHaveCount(1);
  await expect(rows.locator("td").nth(10)).toHaveText("100"); // best team; never 150
  await page
    .getByRole("button", { name: "Individual leaderboard", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await expect(player(11)).toHaveCount(2);
  await expect(player(22)).toHaveCount(1);
  await page
    .getByRole("button", { name: "Team leaderboard", exact: true })
    .click();
  await expect(player(22).locator("td").nth(7)).toHaveText("50");
  await page
    .getByRole("button", { name: "Team placements", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("button", { name: "Solo placements", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Team", exact: true })
    .selectOption("Y");
  await expect(rows).toHaveCount(1);
  await expect(player(22)).toContainText("50");
  await expect(rows.locator("td").nth(2)).toHaveText("2"); // full comparison population
  await page
    .getByRole("button", { name: "Performance scores", exact: true })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(player(22)).toContainText("50");
  // Filtering out the winner must not award another team an MVP.
  await expect(player(22).locator("td").nth(mvpColumn)).toHaveText("0");
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  await expect(player(22)).toHaveCount(1);
  await expect(rows.locator("td").nth(10)).toHaveText("50");
});

test("statistics search matches displayed numbers and raw values", async ({
  page,
}) => {
  await page.goto("/event-statistics");
  await page
    .getByRole("button", { name: "Individual leaderboard", exact: true })
    .click();
  const rows = page.locator("tbody tr");
  const search = page.getByRole("textbox", { name: "Search" });
  await expect(
    rows.getByRole("cell", { name: "98%", exact: true }),
  ).toHaveCount(3);
  await search.fill("98%");
  await expect(rows).toHaveCount(3);
  await search.fill("0.98");
  await expect(rows).toHaveCount(3);
  await search.fill("1,234");
  await expect(rows).toHaveCount(1);
  await expect(rows.getByRole("link", { name: "Old name" })).toBeVisible();
  await search.fill("  OLD NAME  ");
  await expect(rows).toHaveCount(1);
  await search.fill("   ");
  await expect(rows).toHaveCount(3);
  await page
    .getByRole("button", { name: "Mappool statistics", exact: true })
    .click();
  await search.fill("1,001");
  await expect(rows).toHaveCount(0);
  await search.fill("1001");
  await expect(rows.getByRole("link", { name: "1001 ↗" })).toBeVisible();
});

test("statistics notes remain visible below title", async ({ page }) => {
  await page.goto("/event-statistics");
  const panel = page.getByRole("region", { name: "Notes", exact: true });
  await expect(panel).toBeVisible();
  const heading = await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .boundingBox();
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(
    heading!.y + heading!.height,
  );
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Missing data is not zero");
  await panel.getByText("Match coverage", { exact: true }).click();
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Notes", exact: true }),
  ).toHaveCount(0);
});

test("placement ranks and scores keep their units when the map title contains rate", async ({
  page,
}) => {
  await page.goto("/event-statistics?title-only");
  const rows = page.locator("tbody tr");
  await expect(
    rows.first().getByRole("cell", { name: "98%", exact: true }),
  ).toBeVisible();
  await expect(
    rows.first().getByRole("cell", { name: "100%", exact: true }),
  ).toBeVisible();
  for (const view of ["Solo placements", "Team placements"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(
      page.getByRole("columnheader", {
        name: "Final · NM1 · Pirate Radio Score",
      }),
    ).toBeVisible();
    await expect(rows.first().locator("td:nth-last-child(-n+2)")).toHaveText([
      "1",
      "100",
    ]);
    await expect(rows.last().locator("td:nth-last-child(-n+2)")).toHaveText([
      "2",
      "50",
    ]);
  }
});
