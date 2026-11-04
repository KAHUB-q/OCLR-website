import { test, expect } from "@playwright/test";
for (const appearance of ["default", "glassmorphism"]) {
  test(`real page columns align with the header: ${appearance}`, async ({
    page,
    context,
  }) => {
    for (const theme of ["light", "dark"]) {
      await context.addCookies([
        {
          name: "oclr-appearance",
          value: appearance,
          url: "http://127.0.0.1:3100",
        },
        { name: "oclr-theme", value: theme, url: "http://127.0.0.1:3100" },
      ]);
      for (const width of [1440, 1280, 1024, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of [
          "/news",
          "/about",
          "/tournaments",
          "/tournaments/test-cup",
        ]) {
          await page.goto(path);
          const heading = page.locator("main h1:visible").first();
          await expect(heading).toBeVisible();
          const brand = (await page
            .locator(".site-header .brand")
            .boundingBox())!;
          const title = (await heading.boundingBox())!;
          expect(Math.abs(title.x - brand.x)).toBeLessThanOrEqual(1.1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        }
      }
    }
  });
}
