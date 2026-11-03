import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`staff save uses a compact button indicator through the refresh (${theme})`, async ({
    page,
  }, info) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    await page.route("**/api/admin/staff", async (route) => {
      writes++;
      await gate;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/staff-role-form?theme=${theme}`);
    await page.getByRole("checkbox", { name: "裁判", exact: true }).check();
    const save = page.locator(".staff-role-save");
    await save.click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("button").first().click();
    await expect(dialog.locator("[data-loading-region-overlay]")).toBeVisible();
    await expect(dialog.locator("button").first()).toBeDisabled();
    await expect.poll(() => writes).toBe(1);
    release();
    await expect(dialog).not.toBeVisible();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await expect(save).toBeDisabled();
    const spinner = save.locator("[data-spinner]");
    await expect(spinner).toBeVisible();
    await expect(spinner).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
    // A rotating square has changing visual bounds; measure its layout size.
    const spinnerSize = await spinner.evaluate((element) => ({
      width: (element as HTMLElement).offsetWidth,
      height: (element as HTMLElement).offsetHeight,
    }));
    expect(spinnerSize.width).toBeLessThanOrEqual(24);
    expect(spinnerSize.height).toBeLessThanOrEqual(24);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`staff-save-${theme}.png`) });
    await page.evaluate(() =>
      window.dispatchEvent(new Event("finish-refresh")),
    );
    await expect(save).toHaveAttribute("aria-busy", "false");
    await expect(spinner).toHaveCount(0);
    await expect(page.locator(".staff-role-success")).toBeVisible();
    expect(writes).toBe(1);
    await page.getByRole("checkbox", { name: "裁判", exact: true }).uncheck();
    // The synthetic refresh retains the initial saved roles: select a new edit.
    await page.getByRole("checkbox", { name: "設計師", exact: true }).check();
    await expect(save).toBeEnabled();
  });
}

test("a failed save releases the dialog indicator and allows retry", async ({
  page,
}) => {
  await page.route("**/api/admin/staff", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "Confirm a valid role change." },
    }),
  );
  await page.goto("/staff-role-form");
  await page.getByRole("checkbox", { name: "裁判", exact: true }).check();
  await page.locator(".staff-role-save").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("button").first().click();
  // Error refreshes remain inside the dialog until the refreshed data commits.
  await expect(dialog.locator("[role='alert']")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("finish-refresh")));
  await expect(dialog.locator("[data-loading-region-overlay]")).toHaveCount(0);
  await expect(dialog.locator("button").first()).toBeEnabled();
  await dialog.locator("button").last().click();
  await expect(page.locator(".staff-role-form > [role='alert']")).toBeVisible();
  await expect(page.locator(".staff-role-save")).toBeEnabled();
  await expect(page.locator("[data-loading-region-overlay]")).toHaveCount(0);
});
