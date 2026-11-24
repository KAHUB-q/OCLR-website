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
  await expect(page.getByText(/anyone can see your osu!/)).toBeVisible();
  await expect(page.getByText("View named predictions")).toHaveCount(0);
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
      publishAfterMatch: true,
      score: { homeWins: 5, awayWins: 3 },
      expectedVersion: null,
    },
    { outcomeKey: "away", score: null, expectedVersion: 1 },
  ]);
});

for (const strict of [false, true]) {
  test(`restores the edited score after sign-in (strict mode ${strict})`, async ({
    page,
  }) => {
    const submitted: unknown[] = [];
    await page.route("**/fixtures/fixture/pick", async (route) => {
      const body = route.request().postDataJSON();
      submitted.push(body.score);
      await route.fulfill(
        submitted.length === 1
          ? { status: 401, json: {} }
          : {
              json: {
                saved: {
                  outcomeKey: body.outcomeKey,
                  score: body.score,
                  version: 2,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
      );
    });
    await page.goto(`/pickem-match?saved${strict ? "&strict" : ""}`);
    const fields = page.getByRole("group", {
      name: "Predict the score (optional)",
    });
    const home = fields.getByLabel("Aurora Rookies");
    const away = fields.getByLabel("Night Train");
    const save = page.getByRole("button", { name: "Save prediction" });
    await expect(home).toHaveValue("2");
    await home.selectOption("3");
    await away.selectOption("5");
    await save.click();
    await expect(page.getByRole("alert")).toContainText(
      "Your sign-in has expired.",
    );
    await page.reload();
    await expect(home).toHaveValue("3");
    await expect(away).toHaveValue("5");
    expect(submitted).toHaveLength(1);
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("pickem:28001:synthetic-test:fixture-window"),
      ),
    ).toBeNull();
    await save.click();
    await expect(page.getByRole("status")).toContainText("3 : 5");
    expect(submitted).toEqual(Array(2).fill({ homeWins: 3, awayWins: 5 }));
  });
}

test("clearing the away score keeps the home field and saves only the winner", async ({
  page,
}) => {
  await page.route("**/fixtures/fixture/pick", (route) =>
    route.fulfill({
      json: {
        saved: {
          outcomeKey: "away",
          score: null,
          version: 2,
          updatedAt: new Date().toISOString(),
        },
      },
    }),
  );
  await page.goto("/pickem-match?saved");
  const fields = page.getByRole("group", {
    name: "Predict the score (optional)",
  });
  await fields.getByLabel("Night Train").selectOption("");
  await expect(fields.getByLabel("Aurora Rookies")).toHaveValue("2");
  const request = page.waitForRequest("**/fixtures/fixture/pick");
  await page.getByRole("button", { name: "Save prediction" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    outcomeKey: "away",
    score: null,
  });
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
});

test("keeps the list hidden at cutoff and reveals it to guests after the match", async ({
  page,
}) => {
  let loads = 0;
  await page.route("**/fixtures/fixture/predictions?*", (route) => {
    loads++;
    return route.fulfill({
      json: {
        rows: [
          {
            username: "SyntheticAlice",
            outcomeKey: "home",
            score: { homeWins: 5, awayWins: 3 },
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.goto("/pickem-match?closed");
  await expect(
    page.getByText("Predictions are revealed after the match ends."),
  ).toBeVisible();
  await expect(page.getByText("View named predictions")).toHaveCount(0);
  expect(loads).toBe(0);
  await page.goto("/pickem-match?ended");
  const disclosure = page.getByText("View named predictions");
  await expect(disclosure).toBeVisible();
  expect(loads).toBe(0);
  await disclosure.click();
  await expect(page.getByRole("row", { name: /SyntheticAlice/ })).toContainText(
    "5 : 3",
  );
  expect(loads).toBe(1);
});
