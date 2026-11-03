import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://a.ppy.sh/**", (route) => route.abort());
});

test("shows ten players per page and six on the final page without saving", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route("**/api/admin/**", async (route) => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.goto("/captain-manager");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const cards = pool.locator(".captain-player-card");
  const previous = pool.getByRole("button", {
    name: "← Previous",
    exact: true,
  });
  const next = pool.getByRole("button", { name: "Next →", exact: true });
  await expect(cards).toHaveCount(10);
  await expect(pool.getByRole("status")).toHaveText("Page 1 of 8");
  await expect(previous).toBeDisabled();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000011");
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000001");
  for (let i = 1; i < 8; i++) await next.click();
  await expect(pool.getByRole("status")).toHaveText("Page 8 of 8");
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveAttribute("data-player-id", "400000071");
  await expect(cards.last()).toHaveAttribute("data-player-id", "400000076");
  await expect(next).toBeDisabled();
  expect(writes).toHaveLength(0);
});

test("searches the full pool by name or ID and resets pagination", async ({
  page,
}) => {
  await page.goto("/captain-manager");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const search = pool.getByRole("textbox");
  await pool.getByRole("button", { name: "Next →", exact: true }).click();
  await search.fill("SYNTHETIC PLAYER 76");
  await expect(pool.locator(".captain-player-card")).toHaveCount(1);
  await expect(pool.locator(".captain-player-card")).toHaveAttribute(
    "data-player-id",
    "400000076",
  );
  await expect(pool.getByRole("navigation")).toHaveCount(0);
  await search.fill("400000075");
  await expect(pool.locator(".captain-player-card")).toHaveAttribute(
    "data-player-id",
    "400000075",
  );
  await search.fill("missing player");
  await expect(
    pool.getByText("No players match your search.", { exact: true }),
  ).toBeVisible();
  await expect(pool.locator(".captain-player-card")).toHaveCount(0);
  await search.fill("");
  await expect(pool.getByRole("status")).toHaveText("Page 1 of 8");
  await expect(pool.locator(".captain-player-card")).toHaveCount(10);
  await expect(pool.locator(".captain-player-card").first()).toHaveAttribute(
    "data-player-id",
    "400000001",
  );
});

test("appoints the visible last player with the current version and clamps the refreshed page", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route(
    "**/api/admin/tournaments/synthetic/captains",
    async (route) => {
      const body = route.request().postDataJSON();
      writes.push(body);
      await page.evaluate(
        (id) =>
          window.dispatchEvent(
            new CustomEvent("synthetic-appointment", { detail: id }),
          ),
        body.command.userId,
      );
      await route.fulfill({ json: {} });
    },
  );
  await page.goto("/captain-manager?count=21");
  const pool = page.locator('section[aria-labelledby="eligible-pool-heading"]');
  const next = pool.getByRole("button", { name: "Next →", exact: true });
  await next.click();
  await next.click();
  const lastPlayer = pool.locator(".captain-player-card");
  await expect(lastPlayer).toHaveCount(1);
  await expect(lastPlayer).toHaveAttribute("draggable", "true");
  await lastPlayer
    .getByRole("button", {
      name: "Appoint Synthetic Player 21 as captain",
      exact: true,
    })
    .click();
  await expect(pool.getByRole("status")).toHaveText("Page 2 of 2");
  await expect(pool.locator(".captain-player-card")).toHaveCount(10);
  await expect(next).toBeDisabled();
  await expect(page.locator('[data-captain-id="400000021"]')).toBeVisible();
  expect(writes).toEqual([
    {
      command: { action: "appoint", userId: 400000021 },
      expectedVersion: 4,
      confirmed: true,
    },
  ]);
});

for (const mode of ["readonly", "locked"]) {
  test(`${mode} retains pagination and search without enabling appointment`, async ({
    page,
  }) => {
    await page.goto(`/captain-manager?${mode}`);
    const pool = page.locator(
      'section[aria-labelledby="eligible-pool-heading"]',
    );
    await pool.getByRole("button", { name: "Next →", exact: true }).click();
    await expect(pool.getByRole("status")).toHaveText("Page 2 of 8");
    await expect(pool.locator(".captain-player-card").first()).toHaveAttribute(
      "draggable",
      "false",
    );
    await expect(
      pool.getByRole("button", {
        name: "Appoint Synthetic Player 11 as captain",
        exact: true,
      }),
    ).toBeDisabled();
    await pool.getByRole("textbox").fill("400000076");
    await expect(pool.locator(".captain-player-card")).toHaveCount(1);
    await expect(pool.getByRole("navigation")).toHaveCount(0);
    await expect(
      pool.getByRole("button", {
        name: "Appoint Synthetic Player 76 as captain",
        exact: true,
      }),
    ).toBeDisabled();
  });
}

test("pagination fits narrow screens in the three locales and both themes", async ({
  page,
  isMobile,
}, info) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 812 });
  for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
    for (const theme of ["light", "dark"]) {
      await page.goto(`/captain-manager?locale=${locale}&theme=${theme}`);
      const pool = page.locator(
        'section[aria-labelledby="eligible-pool-heading"]',
      );
      const navigation = pool.getByRole("navigation");
      await expect(pool.locator(".captain-player-card")).toHaveCount(10);
      await expect(navigation.getByRole("button").last()).toBeEnabled();
      await expect(navigation.getByRole("status")).toContainText("1");
      expect(
        await navigation.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      if (locale === "zh-Hant") {
        await pool.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(`captain-pool-${theme}.png`),
          animations: "disabled",
        });
      }
    }
  }
});
