import { expect, type Page } from "@playwright/test";

/** Check the workflow's viewport. Component tests own shared layout boundaries;
 * Playwright retains failure screenshots/traces instead of six full-page
 * captures after every seeded flow. */
export async function expectWorkflowFits(page: Page) {
  const width = page.viewportSize()!.width;
  const bounds = await page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    return {
      document: document.documentElement.scrollWidth,
      left: main.left,
      right: main.right,
    };
  });
  expect(bounds.document, page.url()).toBeLessThanOrEqual(width);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width);
}
