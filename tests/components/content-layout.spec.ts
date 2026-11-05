import { test, expect } from "@playwright/test";

for (const appearance of ["default", "glassmorphism"]) {
  test(`header and content align at every width: ${appearance}`, async ({
    page,
    isMobile,
  }) => {
    for (const width of [isMobile ? 320 : 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tournament of [false, true]) {
        await page.goto(
          `/header?alignment&locale=en&appearance=${appearance}${tournament ? "&tournament" : ""}`,
        );
        const brand = page.locator(".site-header .brand");
        await expect(brand).toBeVisible();
        const heading = page.getByRole("heading", {
          name: "Synthetic header preview",
        });
        const brandBox = (await brand.boundingBox())!;
        const headingBox = (await heading.boundingBox())!;
        expect(Math.abs(brandBox.x - headingBox.x)).toBeLessThanOrEqual(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
  });
}
