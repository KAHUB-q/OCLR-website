import { test, expect } from "@playwright/test";
import { appearances } from "../../src/lib/preferences";
for (const appearance of appearances) {
  test(`Chinese UI labels and dates remain readable at 320px: ${appearance}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(
      `/header?typography&locale=zh-Hant&appearance=${appearance}`,
    );
    await expect(page.locator(".event-player-bio")).toBeVisible();
    const small = await page.locator(".themed-site").evaluate((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const failures: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (
          !node.textContent?.trim() ||
          !parent ||
          !parent.checkVisibility() ||
          parent.closest('[aria-hidden="true"]')
        )
          continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size > 0 && size < 12)
          failures.push(`${parent.className}: ${size}: ${node.textContent}`);
      }
      return failures;
    });
    expect(small).toEqual([]);
    for (const time of await page.locator("time:not(.sr-only)").all()) {
      expect(await time.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe(
        "nowrap",
      );
      const box = (await time.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });
}
