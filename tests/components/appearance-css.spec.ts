import { test, expect } from "@playwright/test";
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
