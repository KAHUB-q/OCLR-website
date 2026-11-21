import { expect, test } from "@playwright/test";

test("replaces an incompatible score when changing the selected winner", async ({
  page,
}) => {
  const saves: Record<string, unknown>[] = [];
  await page.route(
    "**/api/tournaments/synthetic-test/pickem/fixtures/fixture/pick",
    async (route) => {
      const body = route.request().postDataJSON();
      saves.push(body);
      await route.fulfill({
        json: {
          saved: {
            outcomeKey: body.outcomeKey,
            score: body.score,
            version: saves.length,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    },
  );
  await page.goto("/pickem-match");
  await page.getByRole("radio", { name: "Aurora Rookies" }).check();
  const score = page.getByRole("group", {
    name: "Predict the score (optional)",
  });
  const home = score.getByLabel("Aurora Rookies");
  const away = score.getByLabel("Night Train");
  await home.selectOption("5");
  await away.selectOption("3");
  await page.getByRole("button", { name: "Save prediction" }).click();
  await expect(page.getByRole("status")).toContainText("5 : 3");
  await page.getByRole("radio", { name: "Night Train" }).check();
  await expect(away).toBeDisabled();
  await expect(home).toHaveValue("");
  await page.getByRole("button", { name: "Save prediction" }).click();
  await expect(page.getByRole("status")).toContainText("Night Train");
  expect(saves).toMatchObject([
    {
      outcomeKey: "home",
      score: { homeWins: 5, awayWins: 3 },
      expectedVersion: null,
    },
    { outcomeKey: "away", score: null, expectedVersion: 1 },
  ]);
});
