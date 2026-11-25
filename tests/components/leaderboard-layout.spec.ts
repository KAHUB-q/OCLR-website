import { expect, test } from "@playwright/test";

for (const board of ["players", "beatmaps"]) {
  test(`${board} sorting controls fit and keep keyboard focus when the layout changes`, async ({
    page,
  }) => {
    await page.route("**/api/osu-images/avatar/*", (route) => route.abort());
    await page.setViewportSize({ width: 380, height: 800 });
    const url =
      board === "beatmaps"
        ? "/player-leaderboard?beatmaps"
        : "/player-leaderboard";
    await page.goto(url);
    const toolbar = page.getByRole("toolbar");
    const buttons = toolbar.getByRole("button");
    const last = buttons.last();
    const rowCount = () =>
      buttons.evaluateAll(
        (items) =>
          new Set(items.map((item) => item.getBoundingClientRect().top)).size,
      );
    await expect(last).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(toolbar).not.toHaveAttribute("data-measuring", "true");
    const narrowRows = await rowCount();
    expect(narrowRows).toBeGreaterThan(2);
    await page.setViewportSize({ width: 3200, height: 800 });
    await expect.poll(rowCount).toBe(1);

    // Just below the width needed for a single desktop row, in this browser's font.
    const { wide, singleRow } = await toolbar.evaluate((bar) => {
      const gutter = window.innerWidth - bar.clientWidth;
      bar.style.width = "max-content";
      const singleRow = bar.getBoundingClientRect().width;
      bar.style.removeProperty("width");
      return { singleRow, wide: Math.floor(singleRow + gutter) - 3 };
    });
    await last.focus();
    await page.setViewportSize({ width: 380, height: 800 });
    await expect.poll(rowCount).toBe(narrowRows);
    await expect(last).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(last).toHaveAccessibleDescription("Sorted descending");

    await page.setViewportSize({ width: wide, height: 800 });
    await expect.poll(rowCount).toBe(2);
    await expect(last).toBeFocused();
    await page.keyboard.press("Space");
    await expect(last).toHaveAccessibleDescription("Sorted ascending");
    await page.keyboard.press("Space");
    await expect(last).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() => toolbar.evaluate((bar) => bar.scrollWidth - bar.clientWidth))
      .toBeLessThanOrEqual(1);

    // Even a fractional shortfall must split the controls into two balanced rows.
    await toolbar.evaluate((bar, width) => {
      bar.style.width = `${width - 0.25}px`;
    }, singleRow);
    const firstRowSize = () =>
      buttons.evaluateAll((items) => {
        const top = items[0].getBoundingClientRect().top;
        return items.filter((item) => item.getBoundingClientRect().top === top)
          .length;
      });
    await expect
      .poll(firstRowSize)
      .toBe(Math.ceil((await buttons.count()) / 2));
  });
}
