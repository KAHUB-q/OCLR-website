import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/tournaments/synthetic/players/*/messages", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://a.ppy.sh/**", (route) => route.abort());
});

test("scrolling appends successive batches and retains the existing player rows", async ({
  page,
}) => {
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  await expect(rows).toHaveCount(40);
  await rows.first().evaluate((row) => {
    row.dataset.retained = "yes";
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await expect(rows.first()).toHaveAttribute("data-retained", "yes");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(105);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
  expect(new Set(await rows.locator("h3").allTextContents()).size).toBe(105);
  await page.getByRole("button", { name: "Team groups", exact: true }).click();
  await expect(rows).toHaveCount(40);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await expect(
    page.getByRole("heading", { name: "Synthetic Team A", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Synthetic Team B", exact: true }),
  ).toHaveCount(1);
});

test("search and sorting reset the batch while applying to the complete directory", async ({
  page,
}) => {
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  await expect(rows).toHaveCount(40);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(80);
  await page.getByRole("searchbox", { name: "Search players" }).fill("Subset");
  await expect(rows).toHaveCount(40);
  await expect(
    page.getByRole("status").filter({ hasText: "65 / 105 Players" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Sort players" })
    .selectOption("name-desc");
  await expect(rows.first().locator("h3")).toHaveText("Subset Player 065");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows).toHaveCount(65);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
  const sort = page.getByRole("combobox", { name: "Sort players" });
  // selectOption also operates off-screen; bring the control into view as a
  // real interaction would before asserting that the visible batch resets.
  await sort.scrollIntoViewIfNeeded();
  await sort.selectOption("name-asc");
  await expect(rows).toHaveCount(40);
  await expect(rows.first().locator("h3")).toHaveText("Subset Player 001");
});

test("the manual button still appends players using the keyboard when automatic observation does not fire", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    window.IntersectionObserver = class extends Observer {
      observe(target: Element) {
        if (!target.classList.contains("event-player-more"))
          super.observe(target);
      }
    };
  });
  await page.goto("/event-players?group=list");
  const rows = page.locator(".event-player-row");
  const more = page.getByRole("button", { name: "Show more players" });
  await expect(rows).toHaveCount(40);
  await more.focus();
  await more.press("Enter");
  await expect(rows).toHaveCount(80);
  await expect(more).toBeFocused();
  await more.press("Enter");
  await expect(rows).toHaveCount(105);
  await expect(more).toHaveCount(0);
});

test("preview continues to show every synthetic player at once", async ({
  page,
}) => {
  await page.goto("/event-players?preview&group=list");
  await expect(page.locator(".event-player-row")).toHaveCount(105);
  await expect(
    page.getByRole("button", { name: "Show more players" }),
  ).toHaveCount(0);
});
