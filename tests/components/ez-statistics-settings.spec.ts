import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`EZ settings validate and survive an authorized save (${theme})`, async ({
    page,
  }) => {
    const writes: Record<string, unknown>[] = [];
    await page.route("**/api/admin/tournaments/test-cup", async (route) => {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      await page.evaluate(
        (detail) =>
          window.dispatchEvent(
            new CustomEvent("synthetic-settings-saved", { detail }),
          ),
        payload,
      );
      await route.fulfill({ json: {} });
    });
    await page.goto(`/tournament-settings?theme=${theme}`);
    const field = page.getByRole("spinbutton", {
      name: "EZ statistics score multiplier (optional)",
    });
    const save = page.getByRole("button", {
      name: "Save general settings",
      exact: true,
    });
    await field.fill("1.12345");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    await field.fill("1.5");
    await save.click();
    await expect(page.locator(".general-settings .settings-save p")).toHaveText(
      "Saved settings",
    );
    await expect(field).toHaveValue("1.5");
    expect(writes[0]).toMatchObject({
      action: "general",
      expectedRevision: 4,
      ezScoreMultiplier: 1.5,
      confirmed: true,
    });
    await field.fill("");
    await save.click();
    await expect(page.locator(".general-settings .settings-save p")).toHaveText(
      "Saved settings",
    );
    expect(writes[1]).toMatchObject({
      expectedRevision: 5,
      ezScoreMultiplier: null,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("remote read-only settings cannot change the multiplier", async ({
  page,
}) => {
  await page.goto("/tournament-settings?readonly");
  await expect(
    page.getByRole("spinbutton", {
      name: "EZ statistics score multiplier (optional)",
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save general settings", exact: true }),
  ).toBeDisabled();
});
