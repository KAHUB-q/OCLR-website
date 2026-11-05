import { test, expect } from "@playwright/test";

// Catalog text, every figure's dimensions/licence and sticker assets are
// checked once in unit/wiki-liru.test.ts. This checks the actual page wiring.
test("the Liru article renders and exposes its downloadable sticker", async ({
  page,
}) => {
  await page.goto("/wiki/liru");
  await expect(page.locator("#wiki-title")).toContainText("Liru");
  const illustration = page.locator(".wiki-figure img").first();
  await illustration.scrollIntoViewIfNeeded();
  await expect(illustration).toHaveJSProperty("complete", true);
  expect(
    await illustration.evaluate((node: HTMLImageElement) => node.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(
    page.locator(
      "#stickers a[href='/mascot/liru/stickers/png/liru-pick-512.png']",
    ),
  ).toBeAttached();
});
