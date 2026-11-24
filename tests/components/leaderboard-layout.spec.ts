import { expect, test } from "@playwright/test";

for (const board of ["players", "beatmaps"]) {
  test(`${board} sorting controls fit after switching between narrow and wide layouts`, async ({
    page,
  }) => {
    await page.route("https://a.ppy.sh/**", (route) => route.abort());
    await page.setViewportSize({ width: 3200, height: 800 });
    const url =
      board === "beatmaps"
        ? "/player-leaderboard?beatmaps"
        : "/player-leaderboard";
    await page.goto(url);
    const toolbar = page.getByRole("toolbar");
    const rows = toolbar.locator(":scope > div");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).not.toHaveAttribute("data-measuring", "true");
    await page.evaluate(() => document.fonts.ready);

    // Just below the width needed for a single desktop row, in this browser's font.
    const wide = await toolbar.evaluate((bar) => {
      const gutter = window.innerWidth - bar.clientWidth;
      bar.style.width = "max-content";
      const width = bar.clientWidth + gutter - 3;
      bar.style.removeProperty("width");
      return width;
    });
    await page.setViewportSize({ width: 380, height: 800 });
    await expect.poll(() => rows.count()).toBeGreaterThan(2);
    const resizedRows = await rows.count();
    await page.reload();
    await expect(rows.first()).not.toHaveAttribute("data-measuring", "true");
    await expect(rows).toHaveCount(resizedRows);

    await page.setViewportSize({ width: wide, height: 800 });
    await expect(rows).toHaveCount(2);
    await expect
      .poll(() => toolbar.evaluate((bar) => bar.scrollWidth - bar.clientWidth))
      .toBeLessThanOrEqual(1);
  });
}
