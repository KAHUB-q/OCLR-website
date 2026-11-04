import { gzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";
import { appearances } from "../../src/lib/preferences";
import { setEditionAppearance } from "../fixtures/editions";
import { closeDb } from "../../src/db";
test.afterAll(closeDb);
test("the default homepage ships less than 25KB of gzip CSS and no optional appearance", async ({
  page,
}) => {
  await page.goto("/");
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
  expect(hrefs.some((href) => href.includes("/appearance-styles/"))).toBe(
    false,
  );
  let bytes = 0;
  for (const href of [...new Set(hrefs)]) {
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    bytes += gzipSync(await response.body()).length;
  }
  expect(bytes).toBeLessThan(25 * 1024);
});
test("SSR emits only the authorized current appearance across all registered themes", async ({
  page,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, "Requires isolated PostgreSQL");
  for (const appearance of appearances) {
    await setEditionAppearance("test-cup", appearance);
    const response = await page.goto("/tournaments/test-cup");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      appearance,
    );
    const styles = await page
      .locator('link[rel="stylesheet"][data-oclr-appearance-style]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(styles).toEqual(
      appearance === "default" ? [] : [`/appearance-styles/${appearance}.css`],
    );
    const preloads = await page
      .locator('link[rel="preload"][as="style"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(
      preloads.filter(
        (href) =>
          href?.includes("/appearance-styles/") &&
          href !== `/appearance-styles/${appearance}.css`,
      ),
    ).toEqual([]);
  }
  await setEditionAppearance("test-cup", "default");
});
