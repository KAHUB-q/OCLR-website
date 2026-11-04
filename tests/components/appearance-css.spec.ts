import { test, expect } from "@playwright/test";

test("retries an appearance whose initial stylesheet already failed and reuses the successful retry", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/appearance-styles/swiss-minimal.css", (route) => {
    attempts += 1;
    return attempts === 1 ? route.abort() : route.continue();
  });
  await page.goto("/header?locale=en&theme=light");
  // Simulate an SSR link that emitted its error before hydration attached listeners.
  await page.evaluate(async () => {
    const link = document.createElement("link");
    link.id = "failed-initial-appearance";
    link.rel = "stylesheet";
    link.href = "/appearance-styles/swiss-minimal.css";
    link.dataset.oclrAppearanceStyle = "swiss-minimal";
    await new Promise<void>((resolve) => {
      link.addEventListener("error", () => resolve(), { once: true });
      document.head.append(link);
    });
  });
  const menu = page.locator(".menu-toggle");
  if (await menu.isVisible()) await menu.click();
  const choose = async (appearance: string) => {
    await page.locator(".appearance-trigger").click();
    await page.locator(`[data-appearance-option="${appearance}"]`).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      appearance,
      { timeout: 5000 },
    );
  };
  await choose("swiss-minimal");
  expect(attempts).toBe(2);
  await expect(page.locator("#failed-initial-appearance")).toHaveCount(1);
  expect(
    await page
      .locator('link[data-oclr-appearance-style="swiss-minimal"]')
      .evaluateAll(
        (links) =>
          links.filter((link) => {
            try {
              return Boolean((link as HTMLLinkElement).sheet?.cssRules.length);
            } catch {
              return false;
            }
          }).length,
      ),
  ).toBe(1);
  await choose("default");
  await choose("swiss-minimal");
  expect(attempts).toBe(2);
});

test("loads a requested appearance before applying it and retains the previous choice on load failure", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  await page.route("**/appearance-styles/swiss-minimal.css", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue();
  });
  await page.goto("/header?locale=en&theme=light");
  const menu = page.locator(".menu-toggle");
  if (await menu.isVisible()) await menu.click();
  await page.locator(".appearance-trigger").click();
  await page.locator('[data-appearance-option="swiss-minimal"]').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "oclr-appearance",
    )?.value,
  ).toBe("swiss-minimal");
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "default",
  );
  release!();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "swiss-minimal",
  );
  await page.route("**/appearance-styles/cute-pastel.css", (route) =>
    route.abort(),
  );
  await page.locator(".appearance-trigger").click();
  await page.locator('[data-appearance-option="cute-pastel"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "swiss-minimal",
  );
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "oclr-appearance",
    )?.value,
  ).toBe("swiss-minimal");
});
